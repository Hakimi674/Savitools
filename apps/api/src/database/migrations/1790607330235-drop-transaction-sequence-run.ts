import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropTransactionSequenceRun1790607330235
  implements MigrationInterface
{
  name = 'DropTransactionSequenceRun1790607330235';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "transaction_sequence_run"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_sequence_run" (
        "id" uuid PRIMARY KEY,
        "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
        "network" varchar NOT NULL,
        "stop_on_failure" boolean NOT NULL,
        "status" varchar NOT NULL,
        "steps" jsonb NOT NULL,
        "results" jsonb,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
}