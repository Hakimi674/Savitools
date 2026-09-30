import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLiquidityPools1790800000000 implements MigrationInterface {
  name = 'CreateLiquidityPools1790800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.watched_pools (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        user_id uuid NOT NULL,
        pool_id character varying(64) NOT NULL,
        network character varying(16) NOT NULL,
        asset_a character varying(64) NOT NULL,
        asset_b character varying(64) NOT NULL,
        label character varying(120),
        created_at timestamp without time zone DEFAULT now() NOT NULL
      );
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.watched_pools'::regclass AND conname = 'PK_watched_pools_id'
        ) THEN
          ALTER TABLE ONLY public.watched_pools
            ADD CONSTRAINT "PK_watched_pools_id" PRIMARY KEY (id);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.watched_pools'::regclass AND conname = 'FK_watched_pools_user_id'
        ) THEN
          ALTER TABLE ONLY public.watched_pools
            ADD CONSTRAINT "FK_watched_pools_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_watched_pools_user_id" ON public.watched_pools USING btree (user_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_watched_pools_pool_network" ON public.watched_pools USING btree (pool_id, network);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.watched_pools CASCADE`);
  }
}
