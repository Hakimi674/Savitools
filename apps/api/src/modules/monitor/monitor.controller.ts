import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpStatus,
  HttpCode,
  UseGuards,
  BadRequestException,
  NotFoundException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { MonitorService } from './monitor.service';
import { CreateWatchDto } from './dto/create-watch.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RegisterWebhookDto } from './dto/register-webhook.dto';
import { SearchEventsQueryDto } from './dto/search-events.dto';
import { ExportEventsQueryDto } from './dto/export-events.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { MonitorLeaderService } from './monitor-leader.service';
import { MonitorRuntimeConfig } from './monitor-runtime.config';
import { StreamManager } from './stream-manager.service';

interface SseClient {
  reply: FastifyReply;
  /**
   * Idle clock: the last time the *peer* was heard from (bytes on the request)
   * or the connection was opened. It is deliberately not touched by our own
   * heartbeat — otherwise the reaper could never fire (Savitura/Savitools#295).
   */
  lastActivity: number;
  /** Last heartbeat we wrote. Diagnostics only; never extends the idle window. */
  lastHeartbeatAt: number;
  timer?: NodeJS.Timeout;
  pingTimer?: NodeJS.Timeout;
}

/** Idle clients are dropped after this long without peer activity. */
const SSE_IDLE_TIMEOUT_MS = 60_000;
const SSE_CLEANUP_INTERVAL_MS = 15_000;
const SSE_PING_INTERVAL_MS = 30_000;

@Controller('monitor')
export class MonitorController implements OnModuleDestroy {
  private readonly logger = new Logger(MonitorController.name);
  private activeSseConnections = 0;
  private readonly clientConnections = new Set<SseClient>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly monitorService: MonitorService,
    private readonly runtime: MonitorRuntimeConfig,
    private readonly leader: MonitorLeaderService,
    private readonly streamManager: StreamManager,
  ) {
    this.cleanupInterval = setInterval(() => {
      this.disconnectIdleClients();
    }, SSE_CLEANUP_INTERVAL_MS);
    // Served connections keep the process up; the reaper must not.
    this.cleanupInterval.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
    for (const client of Array.from(this.clientConnections)) {
      this.terminateConnection(client);
    }
  }

  private disconnectIdleClients(): void {
    const now = Date.now();
    for (const client of Array.from(this.clientConnections)) {
      // A socket the peer already dropped is reclaimed on the next sweep,
      // regardless of how recently we managed to write to it.
      if (this.isClientSocketDead(client) || now - client.lastActivity > SSE_IDLE_TIMEOUT_MS) {
        this.notifyIdleClient(client);
        this.terminateConnection(client, HttpStatus.REQUEST_TIMEOUT);
      }
    }
  }

  private isClientSocketDead(client: SseClient): boolean {
    const socket = client.reply.raw.socket;
    if (client.reply.raw.writableEnded) return true;
    if (!socket) return true;
    return socket.destroyed || !socket.writable;
  }

  /**
   * Tells a live-but-silent client why its stream is ending, so an SSE consumer
   * knows to reconnect instead of waiting on a connection that is gone.
   */
  private notifyIdleClient(client: SseClient): void {
    try {
      if (!client.reply.raw.writableEnded) {
        client.reply.raw.write(
          'event: timeout\ndata: {"reason":"idle"}\n\n',
        );
      }
    } catch {
      // The peer is already gone; terminateConnection below is the cleanup.
    }
  }

  private terminateConnection(client: SseClient, code?: number) {
    if (client.timer) clearInterval(client.timer);
    if (client.pingTimer) clearInterval(client.pingTimer);
    if (this.clientConnections.has(client)) {
      this.clientConnections.delete(client);
      this.activeSseConnections = Math.max(0, this.activeSseConnections - 1);
      try {
        if (!client.reply.raw.writableEnded) {
          if (code) {
            client.reply.raw.statusCode = code;
          }
          client.reply.raw.end();
        }
      } catch (err) {
        this.logger.error(`Error terminating client connection: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * Replica liveness and stream counters for operators: `isProducerLeader` and
   * the Horizon counters tell an operator whether this instance owns the
   * streams, without reading logs. JWT-guarded like the rest of the controller —
   * it exposes the replica role, memory pressure and connection counts.
   */
  @Get('metrics')
  @UseGuards(JwtAuthGuard)
  getMetrics() {
    const memory = process.memoryUsage();
    const round = (bytes: number) => Math.round((bytes / 1_048_576) * 100) / 100;
    return {
      role: this.runtime.role,
      isProducerLeader: this.leader.isLeader(),
      activeSseConnections: this.activeSseConnections,
      maxSseConnections: this.runtime.maxSseConnections,
      heapUsedMb: round(memory.heapUsed),
      rssMb: round(memory.rss),
      uptimeSeconds: Math.round(process.uptime()),
      horizon: this.streamManager.stats(),
    };
  }

  @Get('stream')
  @UseGuards(JwtAuthGuard)
  async stream(
    @Res() reply: FastifyReply,
    @Query('network') network?: string,
  ): Promise<void> {
    // Resolved once at startup (MonitorRuntimeConfig) so the cap can never
    // silently differ from the configured value.
    const maxConns = this.runtime.maxSseConnections;
    if (this.activeSseConnections >= maxConns) {
      reply.status(HttpStatus.SERVICE_UNAVAILABLE).send({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Maximum SSE connections reached',
        error: 'Service Unavailable',
      });
      return;
    }

    this.activeSseConnections++;

    const clientInfo: SseClient = {
      reply,
      lastActivity: Date.now(),
      lastHeartbeatAt: 0,
      timer: undefined as NodeJS.Timeout | undefined,
      pingTimer: undefined as NodeJS.Timeout | undefined,
    };
    this.clientConnections.add(clientInfo);

    // Only the peer keeps a connection alive. Our heartbeat below must not, or
    // `disconnectIdleClients` could never fire (Savitura/Savitools#295).
    const markPeerActivity = () => {
      clientInfo.lastActivity = Date.now();
    };
    reply.request?.raw?.on?.('data', markPeerActivity);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', network: network ?? 'testnet' })}\n\n`);

    clientInfo.pingTimer = setInterval(() => {
      try {
        if (!reply.raw.writableEnded) {
          reply.raw.write(': ping\n\n');
          // Records the heartbeat for diagnostics only: a heartbeat is our own
          // traffic, so it must not reset the peer-activity idle clock.
          clientInfo.lastHeartbeatAt = Date.now();
        }
      } catch (err) {
        this.logger.error(`Failed to send heartbeat ping: ${err instanceof Error ? err.message : String(err)}`);
        this.terminateConnection(clientInfo);
      }
    }, SSE_PING_INTERVAL_MS);
    // The open socket keeps the process up; the heartbeat must not add to it.
    clientInfo.pingTimer.unref?.();

    const cleanup = () => {
      this.terminateConnection(clientInfo);
    };

    reply.raw.on('close', cleanup);
    reply.raw.on('finish', cleanup);
    reply.raw.on('error', cleanup);
  }

  @Post('watches')
  @UseGuards(JwtAuthGuard)
  async createWatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWatchDto,
  ) {
    return this.monitorService.createWatch(user.id, dto);
  }

  @Get('watches')
  @UseGuards(JwtAuthGuard)
  async listWatches(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.monitorService.listWatches(user.id, query);
  }

  @Get('watches/:id')
  @UseGuards(JwtAuthGuard)
  async getWatch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.monitorService.getWatch(user.id, id);
  }

  @Delete('watches/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWatch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    await this.monitorService.deleteWatch(user.id, id);
  }

  @Get('watches/:id/events')
  @UseGuards(JwtAuthGuard)
  async getWatchEvents(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.monitorService.getWatchEvents(user.id, id, query);
  }

  @Get('watches/:id/alerts')
  @UseGuards(JwtAuthGuard)
  async getAlertEvents(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.monitorService.getAlertEvents(user.id, id, query);
  }

  @Post('webhook')
  @UseGuards(JwtAuthGuard)
  async registerWebhook(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterWebhookDto,
  ) {
    return this.monitorService.registerWebhook(user.id, dto);
  }

  @Get('webhook')
  @UseGuards(JwtAuthGuard)
  async getWebhook(@CurrentUser() user: AuthUser) {
    return this.monitorService.getWebhook(user.id);
  }

  // ── Search & CSV export (Savitura/Savitools#195) ────────────

  /**
   * Search watch events across the current user's watches.
   * User ownership is enforced downstream by scoping the query to `user.id`.
   */
  @Get('search')
  @UseGuards(JwtAuthGuard)
  async searchEvents(
    @CurrentUser() user: AuthUser,
    @Query() query: SearchEventsQueryDto,
  ) {
    this.assertIsoDate(query.from, 'from');
    this.assertIsoDate(query.to, 'to');
    return this.monitorService.searchEvents(user.id, query);
  }

  /**
   * Stream the same search results as a CSV attachment. Rows are written in
   * chunks by the service, so memory stays bounded even for 10,000-row
   * exports (the export cap enforced by `ExportEventsQueryDto`).
   */
  @Get('search/export')
  @UseGuards(JwtAuthGuard)
  async exportSearchEventsCsv(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportEventsQueryDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    this.assertIsoDate(query.from, 'from');
    this.assertIsoDate(query.to, 'to');

    reply.raw.setHeader('Content-Type', 'text/csv; charset=utf-8');
    reply.raw.setHeader(
      'Content-Disposition',
      'attachment; filename="monitor-search.csv"',
    );
    // UTF-8 BOM so spreadsheet tools detect the encoding.
    reply.raw.write('\uFEFF');
    reply.raw.write(
      'event_type,occurred_at,amount,asset,from,to,transaction_hash,paging_token,watch_id,payload\r\n',
    );

    try {
      await this.monitorService.streamSearchEventsCsv(
        user.id,
        query,
        (values) => {
          reply.raw.write(
            `${values.map((value) => this.csvEscape(value)).join(',')}\r\n`,
          );
        },
        () => {
          if (!reply.raw.writableEnded) reply.raw.end();
        },
      );
    } catch (err) {
      this.logger.error(
        `CSV export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (!reply.raw.writableEnded) reply.raw.end();
    }
  }

  /** RFC 4180 quoting for a single CSV field. */
  private csvEscape(value: string | number | null): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /** Reject non-ISO date filters with 400 before they reach the service. */
  private assertIsoDate(value: string | undefined, label: string): void {
    if (value === undefined) return;
    const isoDate =
      /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
    if (!isoDate.test(value) || Number.isNaN(Date.parse(value))) {
      throw new BadRequestException(`Invalid ISO date for "${label}"`);
    }
  }
}
