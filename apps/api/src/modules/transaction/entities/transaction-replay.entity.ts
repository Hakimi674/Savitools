import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('transaction_replays')
@Index(['userId', 'createdAt'])
export class TransactionReplay {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 16, default: 'testnet' })
  network!: 'testnet' | 'mainnet';

  @Column({ name: 'original_hash', type: 'varchar', length: 64 })
  originalHash!: string;

  @Column({ name: 'original_xdr', type: 'text' })
  originalXdr!: string;

  @Column({ name: 'original_details', type: 'jsonb', nullable: true })
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb payloads are schema-less */
  originalDetails!: any;

  @Column({ name: 'modified_xdr', type: 'text' })
  modifiedXdr!: string;

  @Column({ type: 'jsonb' })
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb payloads are schema-less */
  modifications!: any;

  @Column({ name: 'simulation_result', type: 'jsonb' })
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb payloads are schema-less */
  simulationResult!: any;

  @Column({ type: 'boolean', default: false })
  submitted!: boolean;

  @Column({ name: 'submitted_hash', type: 'varchar', length: 64, nullable: true })
  submittedHash!: string | null;

  @Column({ name: 'submission_result', type: 'jsonb', nullable: true })
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb payloads are schema-less */
  submissionResult!: any | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
