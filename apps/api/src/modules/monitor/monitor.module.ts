import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Watch } from './entities/watch.entity';
import { WatchEvent } from './entities/watch-event.entity';
import { AlertEvent } from './entities/alert-event.entity';
import { MonitorWebhook } from './entities/monitor-webhook.entity';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { MonitorGateway } from './monitor.gateway';
import { WatchRegistry } from './watch-registry.service';
import { StreamManager } from './stream-manager.service';
import { EventIngestionService } from './event-ingestion.service';
import { AlertEvaluator } from './alert-evaluator.service';
import { MonitorQueueService } from './monitor-queue.service';
import { NotificationWorkerService } from './notification-worker.service';
import { StateEvaluationService } from './state-evaluation.service';
import { MonitorRuntimeConfig } from './monitor-runtime.config';
import {
  MonitorLeaderService,
  monitorLockStoreProvider,
} from './monitor-leader.service';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';

import { MonitorDigestPreference } from './entities/monitor-digest-preference.entity';
import { MonitorDigestService } from './monitor-digest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Watch,
      WatchEvent,
      AlertEvent,
      MonitorWebhook,
      MonitorDigestPreference,
      User,
    ]),
    AuthModule,
  ],
  controllers: [MonitorController],
  providers: [
    MonitorService,
    MonitorGateway,
    WatchRegistry,
    StreamManager,
    EventIngestionService,
    AlertEvaluator,
    MonitorQueueService,
    NotificationWorkerService,
    MonitorDigestService,
    StateEvaluationService,
    // One active producer per cluster (Savitura/Savitools#255): the runtime
    // config resolves MONITOR_ROLE/MAX_SSE_CONNECTIONS once at startup and the
    // leader service owns the Redis lease every producer path checks.
    MonitorRuntimeConfig,
    monitorLockStoreProvider,
    MonitorLeaderService,
  ],
  exports: [MonitorService, MonitorDigestService],
})
export class MonitorModule {}
