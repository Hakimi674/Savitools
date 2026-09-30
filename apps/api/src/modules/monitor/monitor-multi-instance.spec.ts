import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AlertEvaluator } from './alert-evaluator.service';
import { AlertEvent } from './entities/alert-event.entity';
import { Watch } from './entities/watch.entity';
import { horizonServer } from './horizon';
import { MonitorLeaderService } from './monitor-leader.service';
import { createInMemoryMonitorLockStore } from './monitor-lock-store.memory';
import { MonitorQueueService } from './monitor-queue.service';
import { MonitorRuntimeConfig } from './monitor-runtime.config';
import { StateEvaluationService } from './state-evaluation.service';
import { WatchRegistry } from './watch-registry.service';

jest.mock('./horizon', () => ({ horizonServer: jest.fn() }));

const horizonServerMock = horizonServer as jest.MockedFunction<
  typeof horizonServer
>;

describe('Monitor Multi-Instance Integration', () => {
  interface Replica {
    runtime: MonitorRuntimeConfig;
    leader: MonitorLeaderService;
    evaluation: StateEvaluationService;
    queue: MonitorQueueService;
    destroy: () => Promise<void>;
  }

  function makeWatch(publicKey = 'GACCOUNT'): Watch {
    return {
      id: 'watch-multi',
      userId: 'user-multi',
      name: 'Treasury',
      publicKey,
      network: 'testnet',
      type: 'account',
      status: 'active',
      eventTypes: ['payment'],
      alertRules: [
        {
          id: 'rule-low-balance',
          type: 'balance_below',
          threshold: '100',
          asset: 'XLM',
          channels: ['in_app', 'email'],
        },
      ],
      alertState: {},
      lastEvaluatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Watch;
  }

  function stubHorizonBalance(amount: string) {
    horizonServerMock.mockReturnValue({
      accounts: () => ({
        accountId: () => ({
          call: () =>
            Promise.resolve({
              balances: [{ asset_type: 'native', balance: amount }],
            }),
        }),
      }),
      transactions: () => ({
        forAccount: () => ({
          includeFailed: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  records: [],
                  next: () => Promise.resolve({ records: [] }),
                }),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof horizonServer>);
  }

  function createReplica(
    sharedStore: ReturnType<typeof createInMemoryMonitorLockStore>,
    sharedAlerts: AlertEvent[],
    sharedJobs: string[],
    sharedWatch: Watch,
    role = 'all',
  ): Replica {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'MONITOR_ROLE') return role;
        if (key === 'MONITOR_LEADER_LEASE_MS') return '1000';
        return fallback;
      }),
    } as unknown as ConfigService;

    const runtime = new MonitorRuntimeConfig(configService);
    const leader = new MonitorLeaderService(runtime, sharedStore);

    const watchRepository = {
      update: jest.fn(async (_id: string, partial: Partial<Watch>) => {
        Object.assign(sharedWatch, partial);
        return { affected: 1 };
      }),
    } as unknown as Repository<Watch>;

    let alertCounter = sharedAlerts.length;
    const alertEventRepository = {
      create: jest.fn((data: Partial<AlertEvent>) => ({
        id: `alert-${++alertCounter}`,
        ...data,
      })),
      save: jest.fn(async (alert: AlertEvent) => {
        sharedAlerts.push(alert);
        return alert;
      }),
      find: jest.fn(async () =>
        sharedAlerts.filter((a) => a.deliveryStatus === 'pending'),
      ),
    } as unknown as Repository<AlertEvent>;

    const registry = {
      keys: () => [
        `${sharedWatch.network}:${sharedWatch.type}:${sharedWatch.publicKey}`,
      ],
      get: () => [sharedWatch],
    } as unknown as WatchRegistry;

    const queueAdd = jest.fn(
      async (_jobName: string, data: { alertEventId: string }) => {
        sharedJobs.push(data.alertEventId);
      },
    );

    const queue = new MonitorQueueService(
      runtime,
      leader,
      configService,
      alertEventRepository,
    );
    (queue as any).queue = { add: queueAdd, close: jest.fn().mockResolvedValue(undefined) };

    const evaluation = new StateEvaluationService(
      runtime,
      leader,
      configService,
      watchRepository,
      alertEventRepository,
      registry,
      new AlertEvaluator(),
      queue,
    );

    return {
      runtime,
      leader,
      evaluation,
      queue,
      destroy: async () => {
        await evaluation.onModuleDestroy();
        await queue.onModuleDestroy();
        await leader.onModuleDestroy();
      },
    };
  }

  it('produces exactly one alert event and one notification for a single threshold crossing across two replicas', async () => {
    const now = 1_000_000;
    const sharedStore = createInMemoryMonitorLockStore(() => now);
    const sharedAlerts: AlertEvent[] = [];
    const sharedJobs: string[] = [];
    const watch = makeWatch();

    const replicaA = createReplica(
      sharedStore,
      sharedAlerts,
      sharedJobs,
      watch,
    );
    const replicaB = createReplica(
      sharedStore,
      sharedAlerts,
      sharedJobs,
      watch,
    );

    // Boot both replicas
    await replicaA.leader.onModuleInit();
    await replicaB.leader.onModuleInit();

    // Verify lease exclusivity: exactly one replica is elected leader
    expect(replicaA.leader.isLeader() !== replicaB.leader.isLeader()).toBe(
      true,
    );
    expect(
      [replicaA.leader.isLeader(), replicaB.leader.isLeader()].filter(Boolean),
    ).toHaveLength(1);

    // Simulate Horizon returning a balance below threshold (40 < 100)
    stubHorizonBalance('40.0000000');

    // Both replicas run their evaluation tick concurrently (e.g. from timer or request)
    await Promise.all([
      replicaA.evaluation.evaluateAll(),
      replicaB.evaluation.evaluateAll(),
    ]);

    // Exactly one alert event should be recorded in the shared database
    expect(sharedAlerts).toHaveLength(1);
    expect(sharedAlerts[0].watchId).toBe('watch-multi');
    expect(sharedAlerts[0].ruleId).toBe('rule-low-balance');

    // Exactly one job should be enqueued for delivery across both replicas
    expect(sharedJobs).toHaveLength(1);
    expect(sharedJobs[0]).toBe(sharedAlerts[0].id);

    await replicaA.destroy();
    await replicaB.destroy();
  });

  it('fails over cleanly when the leader replica crashes and standby takes over', async () => {
    const now = 1_000_000;
    const sharedStore = createInMemoryMonitorLockStore(() => now);
    const sharedAlerts: AlertEvent[] = [];
    const sharedJobs: string[] = [];
    const watch = makeWatch();

    const replicaA = createReplica(
      sharedStore,
      sharedAlerts,
      sharedJobs,
      watch,
    );
    const replicaB = createReplica(
      sharedStore,
      sharedAlerts,
      sharedJobs,
      watch,
    );

    await replicaA.leader.onModuleInit();
    await replicaB.leader.onModuleInit();

    const leaderReplica = replicaA.leader.isLeader() ? replicaA : replicaB;
    const standbyReplica = leaderReplica === replicaA ? replicaB : replicaA;

    expect(leaderReplica.leader.isLeader()).toBe(true);
    expect(standbyReplica.leader.isLeader()).toBe(false);

    // Leader crashes / destroys cleanly
    await leaderReplica.destroy();
    expect(leaderReplica.leader.isLeader()).toBe(false);

    // Standby detects lease is available and acquires leadership
    await (standbyReplica.leader as any).tick();
    expect(standbyReplica.leader.isLeader()).toBe(true);

    // Standby now acts as leader: Horizon drops balance below threshold
    stubHorizonBalance('30.0000000');
    await standbyReplica.evaluation.evaluateAll();

    expect(sharedAlerts).toHaveLength(1);
    expect(sharedJobs).toHaveLength(1);

    await standbyReplica.destroy();
  });

  it('disables all producers on replicas configured with MONITOR_ROLE=api', async () => {
    const sharedStore = createInMemoryMonitorLockStore();
    const sharedAlerts: AlertEvent[] = [];
    const sharedJobs: string[] = [];
    const watch = makeWatch();

    const apiReplica = createReplica(
      sharedStore,
      sharedAlerts,
      sharedJobs,
      watch,
      'api',
    );

    await apiReplica.leader.onModuleInit();

    expect(apiReplica.leader.isLeader()).toBe(false);
    expect(apiReplica.leader.producerEnabled).toBe(false);

    stubHorizonBalance('20.0000000');
    await apiReplica.evaluation.evaluateAll();

    // No evaluations or alerts produced on API-only role
    expect(sharedAlerts).toHaveLength(0);
    expect(sharedJobs).toHaveLength(0);

    await apiReplica.destroy();
  });
});
