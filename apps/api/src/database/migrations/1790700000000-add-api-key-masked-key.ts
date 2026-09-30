import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Stores the display mask of each playground API key (Savitura/Savitools#293).
 *
 * `GET /playground/keys` and `GET /playground/providers` used to decrypt every
 * stored key — one AES-256-GCM operation per key per request, plus a write for
 * legacy rows — purely to render `first8...last4`. The mask is a property of the
 * plaintext and never changes between reads, so it is persisted instead. Null on
 * existing rows; the service backfills it on the first read.
 */
export class AddApiKeyMaskedKey1790700000000 implements MigrationInterface {
  name = "AddApiKeyMaskedKey1790700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "api_keys"
      ADD COLUMN IF NOT EXISTS "masked_key" character varying
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "api_keys"
      DROP COLUMN IF EXISTS "masked_key"
    `);
  }
}
