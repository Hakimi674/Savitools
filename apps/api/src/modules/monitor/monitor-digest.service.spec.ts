import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MonitorDigestService } from './monitor-digest.service';
import { MonitorDigestPreference } from './entities/monitor-digest-preference.entity';
import { AlertEvent } from './entities/alert-event.entity';
import { Watch } from './entities/watch.entity';
import { User } from '../auth/entities/user.entity';
import { MonitorGateway } from './monitor.gateway';
import { isWithinQuietHours } from './quiet-hours';

describe('MonitorDigestService & Quiet Hours', () => {
  let service: MonitorDigestService;
  let prefRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; update: jest.Mock };
  let alertRepo: { find: jest.Mock; update: jest.Mock; manager: any };
  let watchRepo: { find: jest.Mock; findOne: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let gateway: { emitToUser: jest.Mock };

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: null,
    fluxaTenantId: null,
    emailVerified: true,
    emailVerificationToken: null,
    emailVerificationExpiresAt: null,
    passwordResetToken: null,
    passwordResetExpiresAt: null,
    createdAt: new Date(),
    refreshTokens: [],
    workspaces: [],
    apiKeys: [],
    connectedAccounts: [],
    vaultKeys: [],
  };

  const mockWatch: Watch = {
    id: 'watch-1',
    userId: 'user-1',
    network: 'testnet',
    type: 'contract',
    publicKey: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    label: 'Exchange Contract',
    alertRules: [
      {
        id: 'rule-burst',
        type: 'any_activity',
        channels: ['email', 'in_app'],
      },
      {
        id: 'rule-balance',
        type: 'balance_below',
        threshold: '100',
        channels: ['email'],
      },
    ],
    alertState: { 'rule-balance': true },
    transactionCursor: null,
    paymentCursor: null,
    contractCursor: null,
    cursorLedger: null,
    lastEventAt: null,
    lastEvaluatedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Watch;

  beforeEach(async () => {
    prefRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((dto) => dto as any),
      update: jest.fn().mockResolvedValue({} as any),
    };

    alertRepo = {
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({} as any),
      manager: {
        transaction: jest.fn((cb) => cb({
          getRepository: () => alertRepo,
        })),
      },
    };

    watchRepo = {
      find: jest.fn().mockResolvedValue([mockWatch]),
      findOne: jest.fn().mockResolvedValue(mockWatch),
    };

    userRepo = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    gateway = {
      emitToUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitorDigestService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'RESEND_API_KEY') return null;
              if (key === 'RESEND_FROM_EMAIL') return 'alerts@savitools.dev';
              return null;
            }),
          },
        },
        {
          provide: getRepositoryToken(MonitorDigestPreference),
          useValue: prefRepo,
        },
        {
          provide: getRepositoryToken(AlertEvent),
          useValue: alertRepo,
        },
        {
          provide: getRepositoryToken(Watch),
          useValue: watchRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepo,
        },
        {
          provide: MonitorGateway,
          useValue: gateway,
        },
      ],
    }).compile();

    service = module.get<MonitorDigestService>(MonitorDigestService);
  });

  describe('Digest grouping and distinguishing unresolved/re-firing alerts', () => {
    it('groups burst alerts from one contract into a single watch/rule entry rather than individual notifications', () => {
      // Create 40 burst alerts for the same contract watch and rule
      const alerts: AlertEvent[] = Array.from({ length: 40 }).map((_, i) => ({
        id: `alert-${i}`,
        watchId: 'watch-1',
        watch: mockWatch,
        watchEventId: `event-${i}`,
        watchEvent: null,
        ruleId: 'rule-burst',
        payload: { type: 'any_activity', index: i },
        deliveryStatus: 'held',
        deliveryAttempts: [{ channel: 'email', status: 'held' }],
        deliveredAt: null,
        claimedAt: null,
        claimedBy: null,
        claimKey: null,
        createdAt: new Date(Date.now() + i * 1000),
      }));

      const digest = service.groupAlerts(alerts, 50, 'UTC', 'flush-1');

      expect(digest.totalAlerts).toBe(40);
      expect(digest.groups.length).toBe(1);
      expect(digest.groups[0].watchId).toBe('watch-1');
      expect(digest.groups[0].watchLabel).toBe('Exchange Contract');
      // Exactly 1 rule entry rather than 40 separate items
      expect(digest.groups[0].rules.length).toBe(1);
      expect(digest.groups[0].rules[0].ruleId).toBe('rule-burst');
      expect(digest.groups[0].rules[0].totalAlerts).toBe(40);
      expect(digest.groups[0].rules[0].alerts.length).toBe(40);
    });

    it('distinguishes unresolved and re-firing state alerts in the digest', () => {
      const alert1: AlertEvent = {
        id: 'alert-unresolved-1',
        watchId: 'watch-1',
        watch: mockWatch, // alertState['rule-balance'] is true
        watchEventId: null,
        watchEvent: null,
        ruleId: 'rule-balance',
        payload: { type: 'balance_below', observedValue: '50', threshold: '100' },
        deliveryStatus: 'held',
        deliveryAttempts: [],
        deliveredAt: null,
        claimedAt: null,
        claimedBy: null,
        claimKey: null,
        createdAt: new Date(),
      };

      const alert2: AlertEvent = {
        id: 'alert-refiring-2',
        watchId: 'watch-1',
        watch: mockWatch,
        watchEventId: null,
        watchEvent: null,
        ruleId: 'rule-balance',
        payload: { type: 'balance_below', observedValue: '40', threshold: '100' },
        deliveryStatus: 'held',
        deliveryAttempts: [],
        deliveredAt: null,
        claimedAt: null,
        claimedBy: null,
        claimKey: null,
        createdAt: new Date(Date.now() + 5000),
      };

      const digest = service.groupAlerts([alert1, alert2], 10, 'UTC');
      const ruleGroup = digest.groups[0].rules[0];

      expect(ruleGroup.unresolvedCount).toBe(2);
      expect(ruleGroup.refiringCount).toBe(1);
      expect(ruleGroup.alerts[0].isUnresolved).toBe(true);
      expect(ruleGroup.alerts[0].summary).toContain('[Unresolved]');
      expect(ruleGroup.alerts[1].isRefiring).toBe(true);
      expect(ruleGroup.alerts[1].summary).toContain('[Re-firing]');
    });
  });

  describe('Bounded digest content', () => {
    it('bounds individual alert details and summarizes the remainder by count rather than omitting silently', () => {
      const maxAlerts = 5;
      const alerts: AlertEvent[] = Array.from({ length: 15 }).map((_, i) => ({
        id: `alert-bound-${i}`,
        watchId: 'watch-1',
        watch: mockWatch,
        watchEventId: `event-${i}`,
        watchEvent: null,
        ruleId: 'rule-burst',
        payload: { type: 'any_activity', index: i },
        deliveryStatus: 'held',
        deliveryAttempts: [],
        deliveredAt: null,
        claimedAt: null,
        claimedBy: null,
        claimKey: null,
        createdAt: new Date(),
      }));

      const digest = service.groupAlerts(alerts, maxAlerts, 'UTC');

      expect(digest.totalAlerts).toBe(15);
      expect(digest.displayedAlerts).toBe(5);
      // Remainder is explicitly summarized by count
      expect(digest.summarizedCount).toBe(10);
      expect(digest.groups[0].rules[0].alerts.length).toBe(5);
      expect(digest.groups[0].rules[0].truncatedCount).toBe(10);
    });
  });

  describe('Quiet hours hold and timezone handling', () => {
    it('holds alerts when inside quiet hours and delivers immediately outside quiet hours', async () => {
      // User has quiet hours 22:00 to 08:00 UTC
      prefRepo.findOne!.mockResolvedValueOnce({
        id: 'pref-1',
        userId: 'user-1',
        digestEnabled: false,
        digestIntervalMinutes: 60,
        timezone: 'UTC',
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        maxDigestAlerts: 25,
        lastDigestAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as MonitorDigestPreference);

      // 23:30 UTC -> inside quiet hours
      const insideTime = new Date('2026-05-15T23:30:00Z');
      const shouldHoldInside = await service.shouldHoldAlert('user-1', insideTime);
      expect(shouldHoldInside).toBe(true);

      prefRepo.findOne!.mockResolvedValueOnce({
        id: 'pref-1',
        userId: 'user-1',
        digestEnabled: false,
        digestIntervalMinutes: 60,
        timezone: 'UTC',
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        maxDigestAlerts: 25,
        lastDigestAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as MonitorDigestPreference);

      // 14:00 UTC -> outside quiet hours
      const outsideTime = new Date('2026-05-15T14:00:00Z');
      const shouldHoldOutside = await service.shouldHoldAlert('user-1', outsideTime);
      expect(shouldHoldOutside).toBe(false);
    });

    it('preserves existing immediate behavior when user has not opted into quiet hours or digest', async () => {
      prefRepo.findOne!.mockResolvedValueOnce(null); // default settings

      const shouldHold = await service.shouldHoldAlert('user-1', new Date());
      expect(shouldHold).toBe(false);
    });

    it('correctly handles timezone offsets and Daylight Saving Time (DST) boundaries', () => {
      // America/New_York DST transition:
      // Spring forward occurred on March 8, 2026.
      // At 2026-03-08T06:30:00Z, UTC is 06:30. In EST (UTC-5 before 2am), it would be 01:30.
      // After 2am jump to EDT (UTC-4), 07:30 UTC is 03:30 EDT.
      const dateInEDT = new Date('2026-06-15T02:30:00Z'); // Summer (EDT, UTC-4) -> 22:30 local
      const quiet = isWithinQuietHours(dateInEDT, 'America/New_York', '22:00', '08:00');
      expect(quiet).toBe(true);

      const morningInEDT = new Date('2026-06-15T13:00:00Z'); // 13:00 UTC -> 09:00 EDT (outside 22:00-08:00)
      const quietMorning = isWithinQuietHours(morningInEDT, 'America/New_York', '22:00', '08:00');
      expect(quietMorning).toBe(false);
    });
  });

  describe('Concurrency-safe flush with two workers', () => {
    it('guarantees atomic selection so two workers do not double-claim or send duplicate digests', async () => {
      const alert1: AlertEvent = {
        id: 'alert-claim-1',
        watchId: 'watch-1',
        watch: mockWatch,
        watchEventId: 'ev-1',
        watchEvent: null,
        ruleId: 'rule-burst',
        payload: { type: 'any_activity' },
        deliveryStatus: 'held',
        deliveryAttempts: [],
        deliveredAt: null,
        claimedAt: null,
        claimedBy: null,
        claimKey: null,
        createdAt: new Date(),
      };

      // Mock transaction query builder:
      // When Worker 1 queries, it finds alert1 and marks it claimed.
      // When Worker 2 queries concurrently, alert1 is already claimed, so candidateAlerts is empty!
      let claimed = false;
      const mockEm = {
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            setLock: jest.fn().mockReturnThis(),
            setOnLocked: jest.fn().mockReturnThis(),
            getMany: jest.fn(async () => {
              if (claimed) return [];
              claimed = true;
              return [alert1];
            }),
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            whereInIds: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ affected: 1 }),
          })),
          find: jest.fn(async () => [alert1]),
        })),
      };

      alertRepo.manager = {
        transaction: jest.fn(async (cb) => cb(mockEm)),
      } as any;

      // Two workers race to claim held alerts
      const worker1Claim = await service.claimHeldAlerts('user-1', 'worker-1', 'flush-w1');
      const worker2Claim = await service.claimHeldAlerts('user-1', 'worker-2', 'flush-w2');

      expect(worker1Claim).not.toBeNull();
      expect(worker1Claim?.alerts.length).toBe(1);
      expect(worker1Claim?.alerts[0].id).toBe('alert-claim-1');

      // Worker 2 gets null because worker 1 already claimed the rows
      expect(worker2Claim).toBeNull();
    });

    it('reclaims expired claims after a worker crash to prevent permanent skips', async () => {
      // Simulate an alert claimed by a crashed worker 10 minutes ago (claim lease expired)
      const crashedClaimAlert: AlertEvent = {
        id: 'alert-crashed-1',
        watchId: 'watch-1',
        watch: mockWatch,
        watchEventId: 'ev-crashed',
        watchEvent: null,
        ruleId: 'rule-burst',
        payload: { type: 'any_activity' },
        deliveryStatus: 'claimed',
        deliveryAttempts: [],
        deliveredAt: null,
        claimedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        claimedBy: 'crashed-worker',
        claimKey: 'flush-dead',
        createdAt: new Date(),
      };

      const mockEm = {
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            setLock: jest.fn().mockReturnThis(),
            setOnLocked: jest.fn().mockReturnThis(),
            getMany: jest.fn(async () => [crashedClaimAlert]),
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            whereInIds: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ affected: 1 }),
          })),
          find: jest.fn(async () => [crashedClaimAlert]),
        })),
      };

      alertRepo.manager = {
        transaction: jest.fn(async (cb) => cb(mockEm)),
      } as any;

      const recoveryWorkerClaim = await service.claimHeldAlerts('user-1', 'surviving-worker', 'flush-recovery');

      expect(recoveryWorkerClaim).not.toBeNull();
      expect(recoveryWorkerClaim?.alerts[0].id).toBe('alert-crashed-1');
    });

    it('is idempotent across multiple replica calls for the same flushId', async () => {
      prefRepo.findOne!.mockResolvedValue({
        id: 'pref-1',
        userId: 'user-1',
        digestEnabled: true,
        digestIntervalMinutes: 60,
        timezone: 'UTC',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        maxDigestAlerts: 25,
        lastDigestAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as MonitorDigestPreference);

      jest.spyOn(service, 'claimHeldAlerts').mockResolvedValueOnce({
        alerts: [{
          id: 'a1',
          watchId: 'watch-1',
          watch: mockWatch,
          watchEventId: null,
          watchEvent: null,
          ruleId: 'rule-burst',
          payload: {},
          deliveryStatus: 'claimed',
          deliveryAttempts: [],
          deliveredAt: null,
          claimedAt: new Date(),
          claimedBy: 'w1',
          claimKey: 'flush-shared',
          createdAt: new Date(),
        }],
        flushId: 'flush-shared',
      });

      const firstResult = await service.flushDigestForUser('user-1', 'w1', 'flush-shared');
      expect(firstResult).not.toBeNull();

      // Second replica invokes flush with the same flushId
      const secondResult = await service.flushDigestForUser('user-1', 'w2', 'flush-shared');
      expect(secondResult).toBeNull(); // Idempotent: no second email or gateway emit
    });
  });
});
