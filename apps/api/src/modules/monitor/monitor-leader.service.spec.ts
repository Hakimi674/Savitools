import { ConfigService } from '@nestjs/config';
import { MonitorLeaderService } from './monitor-leader.service';
import { createInMemoryMonitorLockStore } from './monitor-lock-store.memory';
import { MonitorRuntimeConfig } from './monitor-runtime.config';

describe('MonitorLeaderService', () => {
  function makeRuntime(overrides: Record<string, string> = {}): MonitorRuntimeConfig {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) =>
        Object.prototype.hasOwnProperty.call(overrides, key)
          ? overrides[key]
          : fallback,
      ),
    } as unknown as ConfigService;
    return new MonitorRuntimeConfig(configService);
  }

  it('elects exactly one leader among multiple competing replicas', async () => {
    const now = 1_000_000;
    const store = createInMemoryMonitorLockStore(() => now);
    const runtime = makeRuntime({ MONITOR_LEADER_LEASE_MS: '1000' });

    const replicaA = new MonitorLeaderService(runtime, store);
    const replicaB = new MonitorLeaderService(runtime, store);

    await replicaA.onModuleInit();
    await replicaB.onModuleInit();

    const aIsLeader = replicaA.isLeader();
    const bIsLeader = replicaB.isLeader();

    // Exactly one replica holds the lease
    expect(aIsLeader !== bIsLeader).toBe(true);
    expect([aIsLeader, bIsLeader].filter(Boolean)).toHaveLength(1);

    await replicaA.onModuleDestroy();
    await replicaB.onModuleDestroy();
  });

  it('notifies listeners when leadership status changes', async () => {
    const store = createInMemoryMonitorLockStore();
    const runtime = makeRuntime({ MONITOR_LEADER_LEASE_MS: '1000' });
    const service = new MonitorLeaderService(runtime, store);

    const events: boolean[] = [];
    service.onLeadershipChange((leader) => events.push(leader));

    // Registering listener immediately reflects current state (false before init)
    expect(events).toEqual([false]);

    await service.onModuleInit();
    expect(events).toEqual([false, true]);

    await service.onModuleDestroy();
    expect(events).toEqual([false, true, false]);
  });

  it('transfers leadership when the current leader releases its lease on shutdown', async () => {
    const now = 1_000_000;
    const store = createInMemoryMonitorLockStore(() => now);
    const runtime = makeRuntime({ MONITOR_LEADER_LEASE_MS: '1000' });

    const replicaA = new MonitorLeaderService(runtime, store);
    const replicaB = new MonitorLeaderService(runtime, store);

    await replicaA.onModuleInit();
    await replicaB.onModuleInit();

    expect(replicaA.isLeader()).toBe(true);
    expect(replicaB.isLeader()).toBe(false);

    // Leader shuts down cleanly
    await replicaA.onModuleDestroy();
    expect(replicaA.isLeader()).toBe(false);

    // Standby tick acquires the newly released lease
    await (replicaB as any).tick();
    expect(replicaB.isLeader()).toBe(true);

    await replicaB.onModuleDestroy();
  });

  it('transfers leadership after the lease expires without renewal', async () => {
    let now = 1_000_000;
    const store = createInMemoryMonitorLockStore(() => now);
    const runtime = makeRuntime({ MONITOR_LEADER_LEASE_MS: '1000' });

    const replicaA = new MonitorLeaderService(runtime, store);
    const replicaB = new MonitorLeaderService(runtime, store);

    await replicaA.onModuleInit();
    await replicaB.onModuleInit();

    expect(replicaA.isLeader()).toBe(true);

    // Advance clock past the lease duration (1000ms) without A renewing
    now += 1500;

    // Standby's next tick claims the expired lease
    await (replicaB as any).tick();
    expect(replicaB.isLeader()).toBe(true);

    // Replica A tries to renew its expired lease and discovers it lost leadership
    await (replicaA as any).tick();
    expect(replicaA.isLeader()).toBe(false);

    await replicaA.onModuleDestroy();
    await replicaB.onModuleDestroy();
  });

  it('never becomes leader when producer is disabled by role', async () => {
    const store = createInMemoryMonitorLockStore();
    const runtime = makeRuntime({ MONITOR_ROLE: 'api' });
    const service = new MonitorLeaderService(runtime, store);

    await service.onModuleInit();

    expect(service.isLeader()).toBe(false);
    expect(service.producerEnabled).toBe(false);

    await service.onModuleDestroy();
  });
});
