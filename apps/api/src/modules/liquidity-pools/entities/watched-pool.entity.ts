import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('watched_pools')
export class WatchedPool {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  @Index()
  userId!: string;

  @Column({ name: 'pool_id', length: 64 })
  @Index()
  poolId!: string;

  @Column({ name: 'network', length: 16 })
  network!: string;

  @Column({ name: 'asset_a', length: 64 })
  assetA!: string;

  @Column({ name: 'asset_b', length: 64 })
  assetB!: string;

  @Column({ name: 'label', length: 120, nullable: true })
  label!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
