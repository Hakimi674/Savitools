import cookie from '@fastify/cookie';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const JWT_SECRET = 'test-secret';
const CONTRACT_ID = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';

describe('EventsController', () => {
  let app: NestFastifyApplication;
  let jwtService: JwtService;
  let eventsService: jest.Mocked<
    Pick<EventsService, 'queryEvents' | 'filterEvents' | 'replayEvents'>
  >;

  beforeAll(async () => {
    eventsService = {
      queryEvents: jest.fn().mockResolvedValue({
        events: [],
        latestLedger: 500,
        cursor: 'c',
        count: 0,
      }),
      filterEvents: jest.fn().mockReturnValue({ events: [], count: 0 }),
      replayEvents: jest.fn().mockResolvedValue({ delivered: 0, failed: 0, results: [] }),
    };

    const configValues: Record<string, string> = { JWT_SECRET };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: JWT_SECRET })],
      controllers: [EventsController],
      providers: [
        { provide: EventsService, useValue: eventsService },
        JwtAuthGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => configValues[key] ?? defaultValue),
            getOrThrow: jest.fn((key: string) => {
              if (configValues[key] === undefined) throw new Error(`Missing config: ${key}`);
              return configValues[key];
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // Mirrors main.ts: the cookie plugin is what populates request.cookies,
    // which JwtAuthGuard reads before falling back to the Bearer header.
    await app.register(cookie);
    // Mirrors main.ts so DTO validation behaves as it does in production.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    jwtService = moduleRef.get(JwtService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) =>
    app.getHttpAdapter().getInstance().inject(opts);

  const token = () => jwtService.sign({ sub: 'user-1', email: 'dev@example.com' }, { secret: JWT_SECRET });

  describe('GET /contracts/events', () => {
    it('is reachable without authentication', async () => {
      const res = await inject({
        method: 'GET',
        url: `/contracts/events?contractId=${CONTRACT_ID}`,
      });

      expect(res.statusCode).toBe(200);
      expect(eventsService.queryEvents).toHaveBeenCalledWith(
        expect.objectContaining({ contractId: CONTRACT_ID }),
      );
    });

    it('coerces numeric query params to numbers', async () => {
      const res = await inject({
        method: 'GET',
        url: `/contracts/events?contractId=${CONTRACT_ID}&startLedger=42&limit=200`,
      });

      expect(res.statusCode).toBe(200);
      expect(eventsService.queryEvents).toHaveBeenCalledWith(
        expect.objectContaining({ startLedger: 42, limit: 200 }),
      );
    });

    it('rejects a missing contractId with 400', async () => {
      const res = await inject({ method: 'GET', url: '/contracts/events' });
      expect(res.statusCode).toBe(400);
      expect(eventsService.queryEvents).not.toHaveBeenCalled();
    });

    it('rejects a limit above the cap with 400', async () => {
      const res = await inject({
        method: 'GET',
        url: `/contracts/events?contractId=${CONTRACT_ID}&limit=201`,
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects an unknown query parameter with 400', async () => {
      const res = await inject({
        method: 'GET',
        url: `/contracts/events?contractId=${CONTRACT_ID}&bogus=1`,
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects an invalid network with 400', async () => {
      const res = await inject({
        method: 'GET',
        url: `/contracts/events?contractId=${CONTRACT_ID}&network=regtest`,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /contracts/events/filter', () => {
    it('is reachable without authentication', async () => {
      const res = await inject({
        method: 'POST',
        url: '/contracts/events/filter',
        payload: { events: [], criteria: [{ kind: 'topic_contains', value: 'transfer' }] },
      });

      expect(res.statusCode).toBe(201);
      expect(eventsService.filterEvents).toHaveBeenCalledWith(
        [],
        [expect.objectContaining({ kind: 'topic_contains', value: 'transfer' })],
      );
    });

    it('rejects an unknown criterion kind with 400', async () => {
      const res = await inject({
        method: 'POST',
        url: '/contracts/events/filter',
        payload: { events: [], criteria: [{ kind: 'nope' }] },
      });

      expect(res.statusCode).toBe(400);
      expect(eventsService.filterEvents).not.toHaveBeenCalled();
    });

    it('rejects more than ten criteria with 400', async () => {
      const res = await inject({
        method: 'POST',
        url: '/contracts/events/filter',
        payload: {
          events: [],
          criteria: Array.from({ length: 11 }, () => ({ kind: 'value_equals', value: 'x' })),
        },
      });

      expect(res.statusCode).toBe(400);
      expect(eventsService.filterEvents).not.toHaveBeenCalled();
    });

    it('requires JSON numeric ledger bounds instead of coercing malformed values', async () => {
      const res = await inject({
        method: 'POST',
        url: '/contracts/events/filter',
        payload: { events: [], criteria: [{ kind: 'ledger_range', from: 'not-a-number' }] },
      });

      expect(res.statusCode).toBe(400);
      expect(eventsService.filterEvents).not.toHaveBeenCalled();
    });

    it('preserves arbitrary event objects through validation', async () => {
      const events = [{ id: 'e1', topic: [{ type: 'scvSymbol', value: 'transfer', raw: 'AAA=' }] }];
      const res = await inject({
        method: 'POST',
        url: '/contracts/events/filter',
        payload: { events, criteria: [] },
      });

      expect(res.statusCode).toBe(201);
      // whitelist must not strip the nested event payload.
      expect(eventsService.filterEvents).toHaveBeenCalledWith(events, []);
    });
  });

  describe('POST /contracts/events/replay', () => {
    const payload = {
      webhookUrl: 'https://example.com/hook',
      events: [{ id: 'e1' }],
    };

    it('rejects unauthenticated requests with 401', async () => {
      const res = await inject({ method: 'POST', url: '/contracts/events/replay', payload });

      expect(res.statusCode).toBe(401);
      expect(eventsService.replayEvents).not.toHaveBeenCalled();
    });

    it('accepts an authenticated request', async () => {
      const res = await inject({
        method: 'POST',
        url: '/contracts/events/replay',
        headers: { authorization: `Bearer ${token()}` },
        payload,
      });

      expect(res.statusCode).toBe(201);
      expect(eventsService.replayEvents).toHaveBeenCalledWith(
        expect.objectContaining({ webhookUrl: payload.webhookUrl }),
      );
    });

    it('authenticates from the access-token cookie too', async () => {
      const res = await inject({
        method: 'POST',
        url: '/contracts/events/replay',
        headers: { cookie: `savitools_access_token=${token()}` },
        payload,
      });

      expect(res.statusCode).toBe(201);
    });

    it('rejects an empty event batch with 400', async () => {
      const res = await inject({
        method: 'POST',
        url: '/contracts/events/replay',
        headers: { authorization: `Bearer ${token()}` },
        payload: { ...payload, events: [] },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects a batch above the replay cap with 400', async () => {
      const res = await inject({
        method: 'POST',
        url: '/contracts/events/replay',
        headers: { authorization: `Bearer ${token()}` },
        payload: { ...payload, events: Array.from({ length: 201 }, (_, i) => ({ id: `e${i}` })) },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects a too-short secret with 400', async () => {
      const res = await inject({
        method: 'POST',
        url: '/contracts/events/replay',
        headers: { authorization: `Bearer ${token()}` },
        payload: { ...payload, secret: 'short' },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
