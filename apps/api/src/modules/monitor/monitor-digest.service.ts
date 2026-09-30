import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, LessThan, Repository } from 'typeorm';
import { Resend } from 'resend';
import { User } from '../auth/entities/user.entity';
import { AlertEvent } from './entities/alert-event.entity';
import { MonitorDigestPreference } from './entities/monitor-digest-preference.entity';
import { Watch } from './entities/watch.entity';
import { MonitorGateway } from './monitor.gateway';
import {
  DigestAlertEntry,
  DigestPayload,
  DigestRuleGroup,
  DigestWatchGroup,
  UserDigestPreferences,
} from './monitor.types';
import { isWithinQuietHours, isValidTimezone } from './quiet-hours';

export const DEFAULT_MAX_DIGEST_ALERTS = 25;
export const DEFAULT_CLAIM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes crash recovery

export interface UpdateDigestPreferencesDto {
  digestEnabled?: boolean;
  digestIntervalMinutes?: number;
  timezone?: string;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  maxDigestAlerts?: number;
}

@Injectable()
export class MonitorDigestService {
  private readonly logger = new Logger(MonitorDigestService.name);
  private resend?: Resend;
  private readonly completedFlushes = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(MonitorDigestPreference)
    private readonly preferenceRepository: Repository<MonitorDigestPreference>,
    @InjectRepository(AlertEvent)
    private readonly alertEventRepository: Repository<AlertEvent>,
    @InjectRepository(Watch)
    private readonly watchRepository: Repository<Watch>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly gateway: MonitorGateway,
  ) {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
    }
  }

  async getPreferences(userId: string): Promise<UserDigestPreferences> {
    const pref = await this.preferenceRepository.findOne({ where: { userId } });
    if (!pref) {
      return {
        digestEnabled: false,
        digestIntervalMinutes: 60,
        timezone: 'UTC',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        maxDigestAlerts: DEFAULT_MAX_DIGEST_ALERTS,
      };
    }
    return {
      digestEnabled: pref.digestEnabled,
      digestIntervalMinutes: pref.digestIntervalMinutes,
      timezone: pref.timezone,
      quietHoursEnabled: pref.quietHoursEnabled,
      quietHoursStart: pref.quietHoursStart,
      quietHoursEnd: pref.quietHoursEnd,
      maxDigestAlerts: pref.maxDigestAlerts,
    };
  }

  async updatePreferences(
    userId: string,
    dto: UpdateDigestPreferencesDto,
  ): Promise<UserDigestPreferences> {
    if (dto.timezone && !isValidTimezone(dto.timezone)) {
      throw new BadRequestException(`Invalid IANA timezone: "${dto.timezone}"`);
    }
    if (dto.quietHoursStart && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.quietHoursStart)) {
      throw new BadRequestException('quietHoursStart must be in HH:mm 24-hour format');
    }
    if (dto.quietHoursEnd && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.quietHoursEnd)) {
      throw new BadRequestException('quietHoursEnd must be in HH:mm 24-hour format');
    }

    let pref = await this.preferenceRepository.findOne({ where: { userId } });
    if (!pref) {
      pref = this.preferenceRepository.create({
        userId,
        digestEnabled: dto.digestEnabled ?? false,
        digestIntervalMinutes: dto.digestIntervalMinutes ?? 60,
        timezone: dto.timezone ?? 'UTC',
        quietHoursEnabled: dto.quietHoursEnabled ?? false,
        quietHoursStart: dto.quietHoursStart ?? '22:00',
        quietHoursEnd: dto.quietHoursEnd ?? '08:00',
        maxDigestAlerts: dto.maxDigestAlerts ?? DEFAULT_MAX_DIGEST_ALERTS,
      });
    } else {
      if (dto.digestEnabled !== undefined) pref.digestEnabled = dto.digestEnabled;
      if (dto.digestIntervalMinutes !== undefined) pref.digestIntervalMinutes = dto.digestIntervalMinutes;
      if (dto.timezone !== undefined) pref.timezone = dto.timezone;
      if (dto.quietHoursEnabled !== undefined) pref.quietHoursEnabled = dto.quietHoursEnabled;
      if (dto.quietHoursStart !== undefined) pref.quietHoursStart = dto.quietHoursStart;
      if (dto.quietHoursEnd !== undefined) pref.quietHoursEnd = dto.quietHoursEnd;
      if (dto.maxDigestAlerts !== undefined) pref.maxDigestAlerts = dto.maxDigestAlerts;
    }

    const saved = await this.preferenceRepository.save(pref);
    return {
      digestEnabled: saved.digestEnabled,
      digestIntervalMinutes: saved.digestIntervalMinutes,
      timezone: saved.timezone,
      quietHoursEnabled: saved.quietHoursEnabled,
      quietHoursStart: saved.quietHoursStart,
      quietHoursEnd: saved.quietHoursEnd,
      maxDigestAlerts: saved.maxDigestAlerts,
    };
  }

  /**
   * Evaluates whether an alert should be held for digest or delivered immediately.
   *
   * Webhook delivery is never held — webhooks keep their immediate semantics.
   * For in_app and email:
   * - If the user has digest enabled, alerts are held for periodic digest.
   * - If the user has quiet hours enabled and the current time falls inside quiet hours,
   *   alerts are held and delivered as a digest rather than dropped.
   * - Otherwise, immediate delivery takes place (default unconfigured behavior).
   */
  async shouldHoldAlert(userId: string, now: Date = new Date()): Promise<boolean> {
    const pref = await this.getPreferences(userId);
    if (pref.digestEnabled) {
      return true;
    }
    if (pref.quietHoursEnabled) {
      return isWithinQuietHours(now, pref.timezone, pref.quietHoursStart, pref.quietHoursEnd);
    }
    return false;
  }

  /**
   * Concurrency-safe selection and claim of held alerts for a given user.
   *
   * Ported from CrowdPay's concurrency-safety pattern:
   * 1. Selection claims rows atomically so multiple worker replicas cannot select the same rows.
   * 2. Recovers from crashes: previously claimed rows whose claim lease has expired are reclaimed
   *    rather than permanently skipped.
   * 3. Idempotent: once a flush ID completes, it is not re-processed.
   */
  async claimHeldAlerts(
    userId: string,
    workerId: string = randomUUID(),
    flushId: string = randomUUID(),
    claimTimeoutMs: number = DEFAULT_CLAIM_TIMEOUT_MS,
  ): Promise<{ alerts: AlertEvent[]; flushId: string } | null> {
    if (this.completedFlushes.has(flushId)) {
      return null;
    }

    const userWatches = await this.watchRepository.find({
      where: { userId },
      select: ['id'],
    });
    if (userWatches.length === 0) {
      return null;
    }
    const watchIds = userWatches.map((w) => w.id);

    const expiredThreshold = new Date(Date.now() - claimTimeoutMs);

    // Concurrency-safe claim:
    // Select alerts that are 'held' OR ('claimed' by a dead worker whose lease expired)
    return await this.alertEventRepository.manager.transaction(async (em) => {
      const qb = em
        .getRepository(AlertEvent)
        .createQueryBuilder('alert')
        .where('alert.watch_id IN (:...watchIds)', { watchIds })
        .andWhere(
          '(alert.delivery_status = :held OR (alert.delivery_status = :claimed AND alert.claimed_at < :expiredThreshold))',
          {
            held: 'held',
            claimed: 'claimed',
            expiredThreshold,
          },
        )
        .orderBy('alert.createdAt', 'ASC');

      // Use FOR UPDATE SKIP LOCKED where available (Postgres)
      try {
        qb.setLock('pessimistic_write');
        (qb as any).setOnLocked('skip_locked');
      } catch {
        // Fallback for in-memory or SQLite test environments
      }

      const candidateAlerts = await qb.getMany();
      if (candidateAlerts.length === 0) {
        return null;
      }

      const idsToClaim = candidateAlerts.map((a) => a.id);
      const now = new Date();

      await em
        .getRepository(AlertEvent)
        .createQueryBuilder()
        .update(AlertEvent)
        .set({
          deliveryStatus: 'claimed',
          claimedAt: now,
          claimedBy: workerId,
          claimKey: flushId,
        })
        .whereInIds(idsToClaim)
        .execute();

      // Reload with watch relation for digest grouping
      const claimedAlerts = await em.getRepository(AlertEvent).find({
        where: { id: In(idsToClaim) },
        relations: { watch: true, watchEvent: true },
        order: { createdAt: 'ASC' },
      });

      return { alerts: claimedAlerts, flushId };
    });
  }

  /**
   * Groups alerts by watch and rule, distinguishing unresolved and re-firing alerts,
   * with individual details capped at `maxAlerts` and the remainder summarized by count.
   */
  groupAlerts(
    alerts: AlertEvent[],
    maxAlerts: number = DEFAULT_MAX_DIGEST_ALERTS,
    timezone: string = 'UTC',
    flushId: string = randomUUID(),
  ): DigestPayload {
    const watchMap = new Map<
      string,
      {
        watch: Watch;
        rules: Map<string, DigestAlertEntry[]>;
      }
    >();

    const seenRuleIds = new Set<string>();

    for (const alert of alerts) {
      const watchId = alert.watchId;
      if (!watchMap.has(watchId)) {
        watchMap.set(watchId, {
          watch: alert.watch,
          rules: new Map(),
        });
      }

      const watchEntry = watchMap.get(watchId)!;
      if (!watchEntry.rules.has(alert.ruleId)) {
        watchEntry.rules.set(alert.ruleId, []);
      }

      const ruleDef = alert.watch?.alertRules?.find((r) => r.id === alert.ruleId);
      const ruleType = ruleDef?.type || (alert.payload?.type as string) || 'alert';

      const isStateRule = [
        'balance_above',
        'balance_below',
        'transaction_count',
      ].includes(ruleType);

      // Distinguish unresolved vs re-firing alerts:
      // If the watch alert state currently has this rule active, or if payload marks it,
      // it is unresolved. If it was already active in a previous evaluation, it is re-firing.
      const isCurrentlyActive = Boolean(alert.watch?.alertState?.[alert.ruleId]);
      const payloadUnresolved = Boolean(alert.payload?.unresolved || alert.payload?.isUnresolved);
      const isUnresolved = isCurrentlyActive || payloadUnresolved;

      const ruleKey = `${watchId}:${alert.ruleId}`;
      const isRefiring = Boolean(
        alert.payload?.refiring ||
        alert.payload?.isRefiring ||
        (isStateRule && seenRuleIds.has(ruleKey) && isCurrentlyActive),
      );
      seenRuleIds.add(ruleKey);

      const summary = this.buildAlertSummary(alert, ruleType, isUnresolved, isRefiring);

      watchEntry.rules.get(alert.ruleId)!.push({
        id: alert.id,
        ruleId: alert.ruleId,
        ruleType,
        watchId: alert.watchId,
        watchLabel: alert.watch?.label || alert.watch?.publicKey || alert.watchId,
        createdAt: alert.createdAt ? alert.createdAt.toISOString() : new Date().toISOString(),
        isUnresolved,
        isRefiring,
        summary,
        payload: alert.payload || {},
      });
    }

    let displayedCount = 0;
    const groups: DigestWatchGroup[] = [];

    for (const [watchId, entry] of watchMap.entries()) {
      const watchRules: DigestRuleGroup[] = [];
      let watchTotal = 0;

      for (const [ruleId, ruleAlerts] of entry.rules.entries()) {
        watchTotal += ruleAlerts.length;
        const totalAlerts = ruleAlerts.length;
        const unresolvedCount = ruleAlerts.filter((a) => a.isUnresolved).length;
        const refiringCount = ruleAlerts.filter((a) => a.isRefiring).length;

        // Bounded alerts per group
        const availableSlots = Math.max(0, maxAlerts - displayedCount);
        const displayedForThisRule = ruleAlerts.slice(0, availableSlots);
        displayedCount += displayedForThisRule.length;

        watchRules.push({
          ruleId,
          ruleType: displayedForThisRule[0]?.ruleType || 'alert',
          totalAlerts,
          unresolvedCount,
          refiringCount,
          alerts: displayedForThisRule,
          truncatedCount: Math.max(0, totalAlerts - displayedForThisRule.length),
        });
      }

      groups.push({
        watchId,
        watchLabel: entry.watch?.label || entry.watch?.publicKey || watchId,
        publicKey: entry.watch?.publicKey || '',
        rules: watchRules,
        totalAlerts: watchTotal,
      });
    }

    const totalAlerts = alerts.length;
    const summarizedCount = Math.max(0, totalAlerts - displayedCount);

    return {
      flushId,
      timestamp: new Date().toISOString(),
      timezone,
      totalAlerts,
      displayedAlerts: displayedCount,
      summarizedCount,
      groups,
    };
  }

  /**
   * Flushes held alerts for a user and delivers the combined digest.
   *
   * Concurrency-safe: claims rows first, avoiding double-sends and skips.
   * Idempotent: duplicate calls with the same flushId do not repeat deliveries.
   */
  async flushDigestForUser(
    userId: string,
    workerId: string = randomUUID(),
    flushId: string = randomUUID(),
  ): Promise<DigestPayload | null> {
    if (this.completedFlushes.has(flushId)) {
      return null;
    }

    const claimResult = await this.claimHeldAlerts(userId, workerId, flushId);
    if (!claimResult || claimResult.alerts.length === 0) {
      return null;
    }

    const { alerts } = claimResult;
    const pref = await this.getPreferences(userId);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error(`User ${userId} not found for digest flush`);
    }

    const digest = this.groupAlerts(alerts, pref.maxDigestAlerts, pref.timezone, flushId);

    try {
      // 1. Deliver via In-App Gateway
      this.gateway.emitToUser(userId, 'alert_digest', digest);

      // 2. Deliver via Email if configured
      if (this.resend && user.email) {
        await this.sendDigestEmail(user, digest);
      }

      // 3. Mark claimed rows as delivered
      const claimedIds = alerts.map((a) => a.id);
      const now = new Date();

      await this.alertEventRepository.update(
        { id: In(claimedIds) },
        {
          deliveryStatus: 'delivered',
          deliveredAt: now,
          claimedAt: null,
          claimedBy: null,
          claimKey: null,
        },
      );

      // 4. Update last digest time on preferences
      await this.preferenceRepository.update(
        { userId },
        { lastDigestAt: now },
      );

      this.completedFlushes.add(flushId);
      return digest;
    } catch (error) {
      this.logger.error(
        `Failed to deliver digest ${flushId} for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      // Release claim back to held status on failure so it can be re-attempted
      const claimedIds = alerts.map((a) => a.id);
      await this.alertEventRepository.update(
        { id: In(claimedIds) },
        {
          deliveryStatus: 'held',
          claimedAt: null,
          claimedBy: null,
          claimKey: null,
        },
      );
      throw error;
    }
  }

  private buildAlertSummary(
    alert: AlertEvent,
    ruleType: string,
    isUnresolved: boolean,
    isRefiring: boolean,
  ): string {
    const parts: string[] = [];
    if (isRefiring) {
      parts.push('[Re-firing]');
    } else if (isUnresolved) {
      parts.push('[Unresolved]');
    }

    const p = alert.payload || {};
    if (ruleType === 'balance_below' || ruleType === 'balance_above') {
      parts.push(
        `Balance ${p.observedValue ?? 'unknown'} ${p.asset ?? 'XLM'} (threshold: ${p.threshold ?? '?'})`,
      );
    } else if (ruleType === 'amount_received_gte' || ruleType === 'asset_received') {
      parts.push(`Received ${p.amount ?? p.receivedAmount ?? ''} ${p.asset ?? ''}`);
    } else if (ruleType === 'tx_failed' || ruleType === 'failed_contract_call') {
      parts.push(`Failed transaction: ${p.transactionHash ?? alert.id}`);
    } else {
      parts.push(`Rule ${ruleType} triggered`);
    }

    return parts.join(' ').trim();
  }

  private async sendDigestEmail(user: User, digest: DigestPayload): Promise<void> {
    const from = this.configService.get<string>(
      'RESEND_FROM_EMAIL',
      'SaviTools <alerts@savitools.dev>',
    );

    const textLines: string[] = [
      `SaviTools Alert Digest`,
      `Total alerts: ${digest.totalAlerts}`,
      `Timezone: ${digest.timezone}`,
      `Generated at: ${digest.timestamp}`,
      '',
    ];

    for (const group of digest.groups) {
      textLines.push(`Watch: ${group.watchLabel} (${group.totalAlerts} alerts)`);
      for (const rule of group.rules) {
        textLines.push(
          `  Rule [${rule.ruleType}]: ${rule.totalAlerts} alert(s) ${
            rule.unresolvedCount > 0 ? `(${rule.unresolvedCount} unresolved)` : ''
          }`,
        );
        for (const alert of rule.alerts) {
          textLines.push(`    - ${alert.summary} (${alert.createdAt})`);
        }
        if (rule.truncatedCount > 0) {
          textLines.push(
            `    ... and ${rule.truncatedCount} more alert(s) summarized by count`,
          );
        }
      }
      textLines.push('');
    }

    if (digest.summarizedCount > 0) {
      textLines.push(
        `Note: ${digest.summarizedCount} additional alert(s) summarized by count across all watches.`,
      );
    }

    const bodyText = textLines.join('\n');
    await this.resend!.emails.send({
      from,
      to: user.email,
      subject: `SaviTools Alert Digest: ${digest.totalAlerts} alert(s)`,
      text: bodyText,
      html: `<pre style="font-family: monospace; white-space: pre-wrap;">${bodyText}</pre>`,
    });
  }
}
