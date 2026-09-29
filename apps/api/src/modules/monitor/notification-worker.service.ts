import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Worker } from 'bullmq';
import { signatureHeaders } from '../webhook/signature';
import { assertSafeWebhookDestination, MAX_WEBHOOK_REDIRECTS } from '../../common/ssrf-guard';
import { Resend } from 'resend';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { AlertEvent } from './entities/alert-event.entity';
import { MonitorWebhook } from './entities/monitor-webhook.entity';
import {
  MONITOR_NOTIFICATION_QUEUE,
  parseRedisUrl,
} from './monitor-queue.service';
import {
  DeliveryAttempt,
  NotificationChannel,
  NotificationJobData,
} from './monitor.types';
import { MonitorGateway } from './monitor.gateway';
import { MonitorRuntimeConfig } from './monitor-runtime.config';
import { EncryptionService, ENCRYPTION_PURPOSES } from '../../common/encryption.service';
import { MonitorDigestService } from './monitor-digest.service';

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * Consumer half of the alert pipeline.
 *
 * BullMQ hands each job to exactly one worker, so running the consumer in every
 * replica is safe and is what keeps delivery throughput scaling with the
 * deployment — provided the *producer* runs once, which is what
 * {@link MonitorLeaderService} and `MonitorQueueService` guarantee
 * (Savitura/Savitools#255). `MONITOR_ROLE=api` disables the consumer entirely
 * for deployments that run a dedicated monitor worker.
 */
@Injectable()
export class NotificationWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationWorkerService.name);
  private worker?: Worker<NotificationJobData>;
  private resend?: Resend;

  constructor(
    private readonly runtime: MonitorRuntimeConfig,
    private readonly configService: ConfigService,
    @InjectRepository(AlertEvent)
    private readonly alertEventRepository: Repository<AlertEvent>,
    @InjectRepository(MonitorWebhook)
    private readonly webhookRepository: Repository<MonitorWebhook>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly gateway: MonitorGateway,
    private readonly encryptionService: EncryptionService,
    @Optional()
    private readonly digestService?: MonitorDigestService,
  ) {}

  onModuleInit(): void {
    if (!this.runtime.consumerEnabled) {
      this.logger.log(
        `Monitor role "${this.runtime.role}": notification worker is disabled on this instance`,
      );
      return;
    }

    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      return;
    }

    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
    }

    this.worker = new Worker<NotificationJobData>(
      MONITOR_NOTIFICATION_QUEUE,
      (job) => this.process(job),
      {
        connection: {
          ...parseRedisUrl(redisUrl),
          maxRetriesPerRequest: null,
        },
        concurrency: 10,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Notification job ${job?.id ?? 'unknown'} failed: ${error.message}`,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error(`Monitor notification worker error: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<NotificationJobData>): Promise<void> {
    const alertEvent = await this.alertEventRepository.findOne({
      where: { id: job.data.alertEventId },
      relations: { watch: true, watchEvent: true },
    });
    if (!alertEvent) {
      return;
    }

    const user = await this.userRepository.findOne({
      where: { id: alertEvent.watch.userId },
    });
    if (!user) {
      throw new Error('Alert owner no longer exists');
    }

    const rule = alertEvent.watch.alertRules.find(
      (entry) => entry.id === alertEvent.ruleId,
    );
    if (!rule) {
      throw new Error('Alert rule no longer exists');
    }

    const attempts = [...alertEvent.deliveryAttempts];
    const failures: Error[] = [];
    let hasHeldChannel = false;

    for (const channel of rule.channels) {
      if (
        attempts.some(
          (attempt) =>
            attempt.channel === channel &&
            (attempt.status === 'delivered' || attempt.status === 'held'),
        )
      ) {
        continue;
      }

      // Webhooks are never held (webhook path keeps its immediate semantics)
      const isDigestChannel = channel === 'in_app' || channel === 'email';
      const shouldHold =
        isDigestChannel &&
        this.digestService &&
        (await this.digestService.shouldHoldAlert(user.id));

      if (shouldHold) {
        hasHeldChannel = true;
        this.replaceAttempt(attempts, {
          channel,
          status: 'held',
          attemptedAt: new Date().toISOString(),
        });
        continue;
      }

      try {
        await this.deliver(channel, alertEvent, user);
        this.replaceAttempt(attempts, {
          channel,
          status: 'delivered',
          attemptedAt: new Date().toISOString(),
        });
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error(String(error));
        failures.push(failure);
        this.replaceAttempt(attempts, {
          channel,
          status: this.hasRetriesLeft(job) ? 'retrying' : 'failed',
          attemptedAt: new Date().toISOString(),
          error: failure.message,
        });
      }
    }

    alertEvent.deliveryAttempts = attempts;
    alertEvent.deliveryStatus =
      failures.length > 0
        ? this.hasRetriesLeft(job)
          ? 'retrying'
          : 'failed'
        : hasHeldChannel
          ? 'held'
          : 'delivered';
    alertEvent.deliveredAt = failures.length === 0 && !hasHeldChannel ? new Date() : null;
    await this.alertEventRepository.save(alertEvent);

    this.gateway.emitToUser(user.id, 'alert_status', {
      watchId: alertEvent.watchId,
      alert: alertEvent,
    });

    if (failures.length > 0) {
      throw failures[0];
    }
  }

  private async deliver(
    channel: NotificationChannel,
    alertEvent: AlertEvent,
    user: User,
  ): Promise<void> {
    if (channel === 'in_app') {
      this.gateway.emitToUser(user.id, 'alert_event', {
        watchId: alertEvent.watchId,
        alert: alertEvent,
      });
      return;
    }
    if (channel === 'email') {
      await this.sendEmail(alertEvent, user);
      return;
    }
    await this.sendWebhook(alertEvent, user.id);
  }

  private async sendEmail(alertEvent: AlertEvent, user: User): Promise<void> {
    if (!this.resend) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const from = this.configService.get<string>(
      'RESEND_FROM_EMAIL',
      'SaviTools <alerts@savitools.dev>',
    );
    const payload = JSON.stringify(alertEvent.payload, null, 2);
    const result = await this.resend.emails.send({
      from,
      to: user.email,
      subject: `SaviTools alert for ${alertEvent.watch.label ?? alertEvent.watch.publicKey}`,
      text: payload,
      html: `<pre>${this.escapeHtml(payload)}</pre>`,
    });
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  private async sendWebhook(
    alertEvent: AlertEvent,
    userId: string,
  ): Promise<void> {
    const webhook = await this.webhookRepository
      .createQueryBuilder('webhook')
      .addSelect(['webhook.secret', 'webhook.iv', 'webhook.authTag'])
      .where('webhook.user_id = :userId', { userId })
      .andWhere('webhook.enabled = true')
      .getOne();
    if (!webhook) {
      throw new Error('No monitor webhook is configured');
    }

    const secret = await this.decryptAndUpgradeSecret(userId, webhook);

    const destination = new URL(webhook.url);
    await assertSafeWebhookDestination(destination);

    const body = JSON.stringify({
      id: alertEvent.id,
      watchId: alertEvent.watchId,
      ruleId: alertEvent.ruleId,
      event: alertEvent.payload,
    });
    // `signatureHeaders` is the one wire contract every signed webhook path uses
    // (WebhookService and event replay call it too), and the signature pair is
    // computed once so every redirect hop carries the timestamp the signature
    // was made for.
    const signedHeaders = signatureHeaders({ secret, body });
    let currentUrl = destination;
    let response: Response;
    for (let hop = 0; ; hop++) {
      response = await fetch(currentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...signedHeaders,
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      if (!REDIRECT_STATUS_CODES.has(response.status)) break;
      if (hop >= MAX_WEBHOOK_REDIRECTS) {
        throw new Error('Too many webhook redirects');
      }
      const location = response.headers.get('location');
      if (!location) break;
      currentUrl = new URL(location, currentUrl);
      await assertSafeWebhookDestination(currentUrl);
    }
    if (!response.ok) {
      throw new Error(`Webhook returned HTTP ${response.status}`);
    }
  }

  private replaceAttempt(
    attempts: DeliveryAttempt[],
    next: DeliveryAttempt,
  ): void {
    const index = attempts.findIndex(
      (attempt) => attempt.channel === next.channel,
    );
    if (index === -1) {
      attempts.push(next);
    } else {
      attempts[index] = next;
    }
  }

  private hasRetriesLeft(job: Job<NotificationJobData>): boolean {
    const attempts =
      typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
    return job.attemptsMade + 1 < attempts;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /**
   * Decrypt a webhook secret, transparently re-encrypting it under the
   * per-user AES-256-GCM scheme if it is still stored as legacy plaintext.
   * Idempotent: once a row is `secretVersion: 2` this is a no-op read.
   */
  private async decryptAndUpgradeSecret(
    userId: string,
    webhook: MonitorWebhook,
  ): Promise<string> {
    if (webhook.secretVersion === 2 && webhook.iv && webhook.authTag) {
      return this.encryptionService.decryptForUser(
        userId,
        { encrypted: webhook.secret, iv: webhook.iv, authTag: webhook.authTag },
        ENCRYPTION_PURPOSES.MONITOR_WEBHOOK_SECRET,
      );
    }

    const plaintext = webhook.secret;
    const upgraded = this.encryptionService.encryptForUser(
      userId,
      plaintext,
      ENCRYPTION_PURPOSES.MONITOR_WEBHOOK_SECRET,
    );
    await this.webhookRepository.update(webhook.id, {
      secret: upgraded.encrypted,
      iv: upgraded.iv,
      authTag: upgraded.authTag,
      secretVersion: 2,
    });

    return plaintext;
  }
}
