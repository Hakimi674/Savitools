import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema for a brand-new database.
 *
 * The incremental migrations that follow assume the core tables already exist
 * (they were originally written against a schema TypeORM had synchronized in
 * development). This migration creates that schema explicitly, so a clean
 * Postgres volume can be brought up in production with `RUN_MIGRATIONS=true`.
 *
 * Everything is written to be idempotent: a database that already has the
 * schema (or that has already been synchronized by TypeORM in a dev run)
 * applies it as a no-op.
 */
export class CreateInitialSchema1500000000000 implements MigrationInterface {
  name = 'CreateInitialSchema1500000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

DO $$
BEGIN
  CREATE TYPE public.api_keys_provider_enum AS ENUM (
    'fluxa',
    'crowdpay',
    'custom'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.playground_history_provider_enum AS ENUM (
    'fluxa',
    'crowdpay',
    'custom'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.workspaces_tool_enum AS ENUM (
    'sandbox',
    'inspector',
    'webhooks',
    'composer'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.alert_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    watch_id uuid NOT NULL,
    watch_event_id uuid,
    rule_id character varying NOT NULL,
    payload jsonb NOT NULL,
    delivery_status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    delivery_attempts jsonb DEFAULT '[]'::jsonb NOT NULL,
    delivered_at timestamp with time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.api_keys (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    provider public.api_keys_provider_enum NOT NULL,
    label character varying NOT NULL,
    encrypted_key character varying NOT NULL,
    iv character varying NOT NULL,
    auth_tag character varying NOT NULL,
    key_version integer DEFAULT 1 NOT NULL,
    provider_origin character varying,
    "openApiSpec" jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.connected_accounts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    provider character varying NOT NULL,
    encrypted_key text NOT NULL,
    iv character varying(32) NOT NULL,
    auth_tag character varying(32) NOT NULL,
    expires_at timestamp with time zone,
    connected_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.monitor_webhooks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    url character varying(2048) NOT NULL,
    secret text NOT NULL,
    iv text,
    auth_tag text,
    secret_version integer DEFAULT 1 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.network_profiles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    owner_id character varying NOT NULL,
    name character varying(120) NOT NULL,
    horizon_url character varying NOT NULL,
    network_passphrase character varying NOT NULL,
    friendbot_url character varying,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.network_samples (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    network character varying(16) NOT NULL,
    horizon_base_url character varying NOT NULL,
    ok boolean NOT NULL,
    latency_ms integer,
    error text,
    sampled_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.passkeys (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name character varying NOT NULL,
    credential_id character varying NOT NULL,
    algorithm integer NOT NULL,
    public_key text NOT NULL,
    counter bigint DEFAULT '0'::bigint NOT NULL,
    transports json,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.playground_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    provider public.playground_history_provider_enum NOT NULL,
    method character varying NOT NULL,
    path character varying NOT NULL,
    query jsonb,
    request_headers jsonb,
    request_body jsonb,
    response_status integer NOT NULL,
    response_headers jsonb NOT NULL,
    response_body jsonb,
    latency_ms integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    token_hash character varying NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    family_id uuid NOT NULL,
    revoked_at timestamp with time zone,
    ip_address character varying,
    user_agent character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.transaction_replays (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    network character varying(16) DEFAULT 'testnet'::character varying NOT NULL,
    original_hash character varying(64) NOT NULL,
    original_xdr text NOT NULL,
    original_details jsonb,
    modified_xdr text NOT NULL,
    modifications jsonb NOT NULL,
    simulation_result jsonb NOT NULL,
    submitted boolean DEFAULT false NOT NULL,
    submitted_hash character varying(64),
    submission_result jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying NOT NULL,
    password_hash character varying,
    fluxa_tenant_id character varying,
    email_verified boolean DEFAULT false NOT NULL,
    email_verification_token character varying,
    email_verification_expires_at timestamp with time zone,
    password_reset_token character varying,
    password_reset_expires_at timestamp with time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.vault_keys (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name character varying NOT NULL,
    provider character varying NOT NULL,
    encrypted_key text NOT NULL,
    iv character varying(32) NOT NULL,
    auth_tag character varying(32) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.watch_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    watch_id uuid NOT NULL,
    paging_token character varying(128) NOT NULL,
    source character varying(32) NOT NULL,
    event_type character varying(64) NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.watches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    public_key character varying(128) NOT NULL,
    type character varying(50) NOT NULL,
    label character varying,
    network character varying(50) DEFAULT 'testnet'::character varying NOT NULL,
    event_types jsonb DEFAULT '["transaction", "payment"]'::jsonb NOT NULL,
    alert_rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    alert_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_evaluated_at timestamp with time zone,
    transaction_cursor character varying,
    payment_cursor character varying,
    contract_cursor character varying,
    cursor_ledger bigint,
    stream_mode character varying(10) DEFAULT 'poll'::character varying NOT NULL,
    status character varying(16) DEFAULT 'polling'::character varying NOT NULL,
    last_event_at timestamp with time zone,
    last_error text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workspaces (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    tool public.workspaces_tool_enum NOT NULL,
    name character varying(120),
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    share_token character varying,
    share_expires_at timestamp with time zone
);`);

    await queryRunner.query(`DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass AND conname = 'PK_098656ae401f3e1a4586f47fd8e'
  ) THEN
    ALTER TABLE ONLY public.workspaces
        ADD CONSTRAINT "PK_098656ae401f3e1a4586f47fd8e" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.network_profiles'::regclass AND conname = 'PK_180a06b40be231d87b717a986a2'
  ) THEN
    ALTER TABLE ONLY public.network_profiles
        ADD CONSTRAINT "PK_180a06b40be231d87b717a986a2" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.watch_events'::regclass AND conname = 'PK_37a62c61f1b21e22f7513e03247'
  ) THEN
    ALTER TABLE ONLY public.watch_events
        ADD CONSTRAINT "PK_37a62c61f1b21e22f7513e03247" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.playground_history'::regclass AND conname = 'PK_5042f6d3f89b68cc4892d661baf'
  ) THEN
    ALTER TABLE ONLY public.playground_history
        ADD CONSTRAINT "PK_5042f6d3f89b68cc4892d661baf" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.api_keys'::regclass AND conname = 'PK_5c8a79801b44bd27b79228e1dad'
  ) THEN
    ALTER TABLE ONLY public.api_keys
        ADD CONSTRAINT "PK_5c8a79801b44bd27b79228e1dad" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.transaction_replays'::regclass AND conname = 'PK_61e244471658f075c17ec49042c'
  ) THEN
    ALTER TABLE ONLY public.transaction_replays
        ADD CONSTRAINT "PK_61e244471658f075c17ec49042c" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.network_samples'::regclass AND conname = 'PK_6347b60a8e0bb8396f05e1db3cc'
  ) THEN
    ALTER TABLE ONLY public.network_samples
        ADD CONSTRAINT "PK_6347b60a8e0bb8396f05e1db3cc" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vault_keys'::regclass AND conname = 'PK_64ef6bdc10dbbb976a16730007e'
  ) THEN
    ALTER TABLE ONLY public.vault_keys
        ADD CONSTRAINT "PK_64ef6bdc10dbbb976a16730007e" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.connected_accounts'::regclass AND conname = 'PK_70416f1da0be645bb31da01c774'
  ) THEN
    ALTER TABLE ONLY public.connected_accounts
        ADD CONSTRAINT "PK_70416f1da0be645bb31da01c774" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.refresh_tokens'::regclass AND conname = 'PK_7d8bee0204106019488c4c50ffa'
  ) THEN
    ALTER TABLE ONLY public.refresh_tokens
        ADD CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND conname = 'PK_a3ffb1c0c8416b9fc6f907b7433'
  ) THEN
    ALTER TABLE ONLY public.users
        ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.watches'::regclass AND conname = 'PK_c5e1fa5d29486c3bdada54343b3'
  ) THEN
    ALTER TABLE ONLY public.watches
        ADD CONSTRAINT "PK_c5e1fa5d29486c3bdada54343b3" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.passkeys'::regclass AND conname = 'PK_db928e6fd79e7098911268a74c3'
  ) THEN
    ALTER TABLE ONLY public.passkeys
        ADD CONSTRAINT "PK_db928e6fd79e7098911268a74c3" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.monitor_webhooks'::regclass AND conname = 'PK_e729cc7874920da07f40517bebf'
  ) THEN
    ALTER TABLE ONLY public.monitor_webhooks
        ADD CONSTRAINT "PK_e729cc7874920da07f40517bebf" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.alert_events'::regclass AND conname = 'PK_f8dd833a0534d3a01e8d01e3bca'
  ) THEN
    ALTER TABLE ONLY public.alert_events
        ADD CONSTRAINT "PK_f8dd833a0534d3a01e8d01e3bca" PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND conname = 'UQ_1f398dad0913cfd40f49cf9b63e'
  ) THEN
    ALTER TABLE ONLY public.users
        ADD CONSTRAINT "UQ_1f398dad0913cfd40f49cf9b63e" UNIQUE (fluxa_tenant_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass AND conname = 'UQ_47c4ef7a55ee2f4b3ce94963636'
  ) THEN
    ALTER TABLE ONLY public.workspaces
        ADD CONSTRAINT "UQ_47c4ef7a55ee2f4b3ce94963636" UNIQUE (share_token);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.passkeys'::regclass AND conname = 'UQ_81b80835fab9dcadaebc6d168ab'
  ) THEN
    ALTER TABLE ONLY public.passkeys
        ADD CONSTRAINT "UQ_81b80835fab9dcadaebc6d168ab" UNIQUE (credential_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND conname = 'UQ_97672ac88f789774dd47f7c8be3'
  ) THEN
    ALTER TABLE ONLY public.users
        ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass AND conname = 'UQ_bc69cad849094113205b0f8e183'
  ) THEN
    ALTER TABLE ONLY public.workspaces
        ADD CONSTRAINT "UQ_bc69cad849094113205b0f8e183" UNIQUE (user_id, tool, name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.api_keys'::regclass AND conname = 'UQ_d3ac254230dabb760eac4b2ab16'
  ) THEN
    ALTER TABLE ONLY public.api_keys
        ADD CONSTRAINT "UQ_d3ac254230dabb760eac4b2ab16" UNIQUE (user_id, provider, label);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.network_profiles'::regclass AND conname = 'UQ_d86a489e0243681dc7b7bdbb696'
  ) THEN
    ALTER TABLE ONLY public.network_profiles
        ADD CONSTRAINT "UQ_d86a489e0243681dc7b7bdbb696" UNIQUE (owner_id, name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.passkeys'::regclass AND conname = 'FK_02227b9a8a34a808e3e23800b00'
  ) THEN
    ALTER TABLE ONLY public.passkeys
        ADD CONSTRAINT "FK_02227b9a8a34a808e3e23800b00" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.monitor_webhooks'::regclass AND conname = 'FK_0292c2696f9f5f2478e46fa4396'
  ) THEN
    ALTER TABLE ONLY public.monitor_webhooks
        ADD CONSTRAINT "FK_0292c2696f9f5f2478e46fa4396" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vault_keys'::regclass AND conname = 'FK_2d9ad64f9771ef5257997ec6a2c'
  ) THEN
    ALTER TABLE ONLY public.vault_keys
        ADD CONSTRAINT "FK_2d9ad64f9771ef5257997ec6a2c" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.refresh_tokens'::regclass AND conname = 'FK_3ddc983c5f7bcf132fd8732c3f4'
  ) THEN
    ALTER TABLE ONLY public.refresh_tokens
        ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.playground_history'::regclass AND conname = 'FK_4f2d39071d5be17b313f19f72ff'
  ) THEN
    ALTER TABLE ONLY public.playground_history
        ADD CONSTRAINT "FK_4f2d39071d5be17b313f19f72ff" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.alert_events'::regclass AND conname = 'FK_5128687c1a2e18c43185bdf3650'
  ) THEN
    ALTER TABLE ONLY public.alert_events
        ADD CONSTRAINT "FK_5128687c1a2e18c43185bdf3650" FOREIGN KEY (watch_event_id) REFERENCES public.watch_events(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.transaction_replays'::regclass AND conname = 'FK_603bc055313de63f9ae1057da93'
  ) THEN
    ALTER TABLE ONLY public.transaction_replays
        ADD CONSTRAINT "FK_603bc055313de63f9ae1057da93" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.watches'::regclass AND conname = 'FK_6a60edeba6e48e32ba6fb629cd1'
  ) THEN
    ALTER TABLE ONLY public.watches
        ADD CONSTRAINT "FK_6a60edeba6e48e32ba6fb629cd1" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass AND conname = 'FK_78512d762073bf8cb3fc88714c1'
  ) THEN
    ALTER TABLE ONLY public.workspaces
        ADD CONSTRAINT "FK_78512d762073bf8cb3fc88714c1" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.api_keys'::regclass AND conname = 'FK_a3baee01d8408cd3c0f89a9a973'
  ) THEN
    ALTER TABLE ONLY public.api_keys
        ADD CONSTRAINT "FK_a3baee01d8408cd3c0f89a9a973" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.connected_accounts'::regclass AND conname = 'FK_f47244225a6a1eac04a3463dd90'
  ) THEN
    ALTER TABLE ONLY public.connected_accounts
        ADD CONSTRAINT "FK_f47244225a6a1eac04a3463dd90" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.alert_events'::regclass AND conname = 'FK_f9ced0f9b14ab0d89b9631c8f55'
  ) THEN
    ALTER TABLE ONLY public.alert_events
        ADD CONSTRAINT "FK_f9ced0f9b14ab0d89b9631c8f55" FOREIGN KEY (watch_id) REFERENCES public.watches(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.watch_events'::regclass AND conname = 'FK_facdf8b6634e5c874831e583737'
  ) THEN
    ALTER TABLE ONLY public.watch_events
        ADD CONSTRAINT "FK_facdf8b6634e5c874831e583737" FOREIGN KEY (watch_id) REFERENCES public.watches(id) ON DELETE CASCADE;
  END IF;
END $$;`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_02227b9a8a34a808e3e23800b0" ON public.passkeys USING btree (user_id);

CREATE INDEX IF NOT EXISTS "IDX_alert_events_watch_created" ON public.alert_events USING btree (watch_id, created_at);

CREATE INDEX IF NOT EXISTS "IDX_cd7193bf1f8b1e6f857949239c" ON public.network_samples USING btree (network, sampled_at);

CREATE INDEX IF NOT EXISTS "IDX_f0bfa70a2064d0e3bfa7b5da6e" ON public.playground_history USING btree (user_id, created_at);

CREATE INDEX IF NOT EXISTS "IDX_fd18c6f22411d488e10a8785d4" ON public.transaction_replays USING btree (user_id, created_at);

CREATE INDEX IF NOT EXISTS "IDX_watch_events_watch_created" ON public.watch_events USING btree (watch_id, created_at);

CREATE INDEX IF NOT EXISTS "IDX_watches_stream_key" ON public.watches USING btree (network, type, public_key);

CREATE INDEX IF NOT EXISTS "IDX_workspaces_user_id" ON public.workspaces USING btree (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_alert_events_rule_event" ON public.alert_events USING btree (watch_id, rule_id, watch_event_id);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_monitor_webhooks_user" ON public.monitor_webhooks USING btree (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_watch_events_source_cursor" ON public.watch_events USING btree (watch_id, source, paging_token);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_workspaces_user_tool_default" ON public.workspaces USING btree (user_id, tool) WHERE (name IS NULL);`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.workspaces, public.watches, public.watch_events, public.vault_keys, public.users, public.transaction_replays, public.refresh_tokens, public.playground_history, public.passkeys, public.network_samples, public.network_profiles, public.monitor_webhooks, public.connected_accounts, public.api_keys, public.alert_events CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.api_keys_provider_enum, public.playground_history_provider_enum, public.workspaces_tool_enum`);
  }
}
