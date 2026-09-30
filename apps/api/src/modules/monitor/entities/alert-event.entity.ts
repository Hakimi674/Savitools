import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DeliveryAttempt, DeliveryStatus } from '../monitor.types';
import { WatchEvent } from './watch-event.entity';
import { Watch } from './watch.entity';

@Entity('alert_events')
@Index('UQ_alert_events_rule_event', ['watchId', 'ruleId', 'watchEventId'], {
  unique: true,
})
@Index('IDX_alert_events_watch_created', ['watchId', 'createdAt'])
export class AlertEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'watch_id' })
  watchId!: string;

  @ManyToOne(() => Watch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'watch_id' })
  watch!: Watch;

  /** Null for state-based alerts, which are not tied to a ledger event. */
  @Column({ name: 'watch_event_id', type: 'uuid', nullable: true })
  watchEventId!: string | null;

  @ManyToOne(() => WatchEvent, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'watch_event_id' })
  watchEvent!: WatchEvent | null;

  @Column({ name: 'rule_id' })
  ruleId!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({
    name: 'delivery_status',
    type: 'varchar',
    length: 16,
    default: 'pending',
  })
  deliveryStatus!: DeliveryStatus;

  @Column({
    name: 'delivery_attempts',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  deliveryAttempts!: DeliveryAttempt[];

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimedAt!: Date | null;

  @Column({ name: 'claimed_by', type: 'varchar', nullable: true })
  claimedBy!: string | null;

  @Column({ name: 'claim_key', type: 'varchar', nullable: true })
  claimKey!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
