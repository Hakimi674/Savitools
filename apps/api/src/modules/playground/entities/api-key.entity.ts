import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum ApiKeyProvider {
  FLUXA = 'fluxa',
  CROWDPAY = 'crowdpay',
  CUSTOM = 'custom',
}

@Entity('api_keys')
@Unique(['userId', 'provider', 'label'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'enum', enum: ApiKeyProvider })
  provider!: ApiKeyProvider;

  @Column()
  label!: string;

  @Column({ name: 'encrypted_key' })
  encryptedKey!: string;

  @Column()
  iv!: string;

  @Column({ name: 'auth_tag' })
  authTag!: string;

  /**
   * 1 = legacy scheme (global key derived from JWT_SECRET via PBKDF2).
   * 2 = per-user key derived from ENCRYPTION_SECRET via HKDF (EncryptionService).
   * Legacy rows are transparently re-encrypted to version 2 on first read.
   */
  @Column({ name: 'key_version', default: 1 })
  keyVersion!: number;

  @Column({ name: 'provider_origin', type: 'varchar', nullable: true })
  providerOrigin!: string | null;

  /**
   * Display mask (`first8...last4`) of the plaintext, computed while the
   * plaintext is in hand at write time.
   *
   * The mask is a property of the plaintext and never changes between reads, so
   * the list paths serve it from this column instead of decrypting every stored
   * key on every request (Savitura/Savitools#293). Null on rows written before
   * the column existed — those are backfilled on the first read.
   */
  @Column({ name: 'masked_key', type: 'varchar', nullable: true })
  maskedKey!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  openApiSpec!: Record<string, unknown> | null;

  /**
   * Precomputed mask (first8...last4) of the decrypted key, stored to avoid
   * decrypting on every list operation. Computed at save/update time.
   */
  @Column({ name: 'key_preview', type: 'varchar', nullable: true })
  keyPreview!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
