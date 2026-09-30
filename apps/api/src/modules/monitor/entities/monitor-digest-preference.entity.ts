import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('monitor_digest_preferences')
@Unique(['userId'])
export class MonitorDigestPreference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'digest_enabled', type: 'boolean', default: false })
  digestEnabled!: boolean;

  @Column({ name: 'digest_interval_minutes', type: 'int', default: 60 })
  digestIntervalMinutes!: number;

  @Column({ name: 'timezone', type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;

  @Column({ name: 'quiet_hours_enabled', type: 'boolean', default: false })
  quietHoursEnabled!: boolean;

  @Column({ name: 'quiet_hours_start', type: 'varchar', length: 8, default: '22:00' })
  quietHoursStart!: string;

  @Column({ name: 'quiet_hours_end', type: 'varchar', length: 8, default: '08:00' })
  quietHoursEnd!: string;

  @Column({ name: 'max_digest_alerts', type: 'int', default: 25 })
  maxDigestAlerts!: number;

  @Column({ name: 'last_digest_at', type: 'timestamptz', nullable: true })
  lastDigestAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
