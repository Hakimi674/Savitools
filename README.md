# SaviTools

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

**A developer workstation for building on Stellar.**

SaviTools is a standalone product in the [Savitura](https://savitura.com) ecosystem. It gives developers the tools they need to build, test, and debug Stellar-based payment applications — without needing a terminal, Rust toolchain, or deep protocol knowledge.

> **Status**: Active development — testnet only.

---

## Tools

| Tool                      | What it does                                                                          | Status |
| ------------------------- | ------------------------------------------------------------------------------------- | ------ |
| **Transaction Inspector** | Decode any tx hash, Stellar address, or raw XDR into a human-readable breakdown       | MVP    |
| **Wallet Sandbox**        | Generate testnet keypairs, fund via Friendbot, send test payments                     | MVP    |
| **Transaction Composer**  | Visual builder for multi-operation Stellar transactions; sign and submit without code | MVP    |
| **Payment Simulator**     | Find path payment routes between assets; preview hops, rates, and fees                | MVP    |
| **Webhook Tester**        | Fire sample CrowdPay / Fluxa webhook payloads at your endpoint; inspect the response  | MVP    |
| **Ledger Monitor**        | Watch a Stellar address or contract for live activity; set threshold alerts           | MVP    |
| **API Playground**        | Interactive request builder for Fluxa and CrowdPay APIs                               | MVP    |
| **Contract Deployer**     | Upload and deploy Soroban WASM files to testnet from the browser                      | MVP    |
| **SDK Generator**         | Generate copy-paste client code (JS, Python, Go, cURL) from Fluxa/CrowdPay endpoints  | MVP     |
| **Network Status**        | Live Stellar network health: ledger close time, fee tracker, Horizon latency          | MVP     |
| **Federation & TOML**     | Resolve federation addresses, inspect stellar.toml files, check SEP compliance        | MVP    |
| **Order Book**            | Live DEX order book, spread analytics, and liquidity depth chart for any asset pair   | MVP    |
| **Account Graph**         | Visualize signer networks, offers, and payment relationships with a force-directed graph | MVP |
| **Contract Events**       | Decode, filter, and replay Soroban contract events from raw ScVal XDR                 | MVP    |
| **Liquidity Pool Explorer** | Search Stellar AMM pools, calculate LP share values, and track favorite pools          | MVP    |

See the [Contract Events guide](docs/contract-events.md) for filter criteria, limits, and API usage.

---

## Architecture

```
Browser ──────────────────────────────────────────────────────────────────
  Next.js 15 (App Router) │ TypeScript │ Tailwind CSS │ shadcn/ui
──────────────────────────────────────────────────────────────────────────
                           │ HTTP
                           ▼
API ──────────────────────────────────────────────────────────────────────
  NestJS (Fastify adapter) │ TypeORM │ BullMQ │ Swagger at /api/docs
  ┌─────────────────────────────────────────────────────────────────┐
  │ modules: transaction · wallet · simulator · webhook · monitor   │
  │          playground · contracts · sdkgen · network · federation │
  │          metrics · sandbox · workspace · stellar · auth         │
  └─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    PostgreSQL              Redis             Stellar Horizon
    (workspaces,        (BullMQ queues,       (testnet +
    watches, history)    rate cache)           mainnet)
```

**Monorepo layout (Turborepo)**

```
savitools/
├── apps/
│   ├── web/                      # Next.js 15 frontend
│   │   └── src/app/
│   │       ├── page.tsx          # Home / onboarding
│   │       ├── inspector/        # Transaction Inspector
│   │       ├── sandbox/          # Wallet Sandbox
│   │       ├── composer/         # Transaction Composer
│   │       ├── simulator/        # Payment Simulator (route finder)
│   │       ├── webhooks/         # Webhook Tester
│   │       ├── monitor/          # Ledger Monitor
│   │       ├── playground/       # API Playground
│   │       ├── contracts/        # Soroban Deploy Helper
│   │       ├── sdk/              # SDK Generator
│   │       └── network/          # Network Status
│   │
│   └── api/                      # NestJS backend
│       └── src/modules/
│           ├── transaction/       # Horizon lookups, XDR decode
│           ├── wallet/            # Keypair gen, Friendbot, balances
│           ├── simulator/         # Path payment route simulation
│           ├── webhook/           # Test endpoint registration + firing
│           ├── monitor/           # Horizon SSE streaming, alert rules
│           ├── playground/        # Spec proxy, API forwarding
│           ├── contracts/         # Soroban WASM upload + deploy
│           ├── sdkgen/            # Client code generation
│           ├── network/           # Fee stats, ledger health
│           └── auth/              # User accounts, JWT, Fluxa SSO
│
├── docker-compose.yml
├── turbo.json
└── .env.example
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for local Postgres + Redis)

### 1. Install dependencies

```bash
git clone https://github.com/Savitura/Savitools
cd Savitools
npm install
```

### 2. Configure environment

Two templates, two scopes - create both:

```bash
cp .env.example .env                    # root: infrastructure + compose ports
cp apps/api/.env.example apps/api/.env  # API runtime variables
```

The compose files interpolate the **root** `.env` (Compose loads it
automatically); the per-app files are read by each app at runtime. The full-stack
compose file treats the per-app files as _optional_ overrides, so the stack still
boots when they are missing.

| Variable                 | Description                                           | Default / Example                                         |
| ------------------------ | ----------------------------------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string                          | `postgresql://postgres:password@localhost:5432/savitools` |
| `REDIS_URL`              | Redis connection string                               | `redis://localhost:6379`                                  |
| `STELLAR_NETWORK`        | Stellar network (`testnet` or `public`)               | `testnet`                                                 |
| `STELLAR_HORIZON_URL`    | Horizon API URL                                       | `https://horizon-testnet.stellar.org`                     |
| `STELLAR_RPC_URL`        | Soroban RPC URL                                       | `https://soroban-rpc-testnet.stellar.org`                 |
| `STELLAR_NETWORK_PASSPHRASE` | Passphrase matching the network (optional — falls back to the well-known passphrase) | `"Test SDF Network ; September 2015"` |
| `JWT_SECRET`             | JWT signing secret (required; ≥32 chars in production) | Generate with `openssl rand -hex 32`                      |
| `ENCRYPTION_SECRET`      | Master secret for per-user key derivation (required in production) | Generate with `openssl rand -base64 48`        |
| `DEPLOYER_SECRET_KEY`    | Stellar secret key required to boot — `ContractsService` reads it with `getOrThrow` and parses it with `Keypair.fromSecret` during construction; a throwaway testnet key is enough | (Required)                        |
| `RESEND_FROM_EMAIL`      | `From` address for all transactional email            | `SaviTools <noreply@savitools.dev>`                       |
| `WEB_ORIGIN`             | Allowed origin for API and WebSocket CORS             | `http://localhost:3000`                                   |
| `THROTTLE_TTL`           | Rate limiting sliding window size in milliseconds     | `60000` (1 minute)                                        |
| `THROTTLE_LIMIT`         | Max requests allowed in the rate limit window         | `100`                                                     |
| `NEXT_PUBLIC_API_URL`    | Frontend → API URL                                    | `http://localhost:3001/api`                               |

**`DEPLOYER_SECRET_KEY` is required to boot the API.** `ContractsService`
reads it with `getOrThrow` and parses it with `Keypair.fromSecret` while the
module is being constructed, so the API cannot start without a syntactically
valid Stellar secret key (56 characters, starting with `S`). A throwaway,
unfunded **testnet** key is enough to start the stack - funding it is only
necessary if you actually deploy a contract. Generate one after `npm install`:

```bash
node -p "require('@stellar/stellar-sdk').Keypair.random().secret()"
```

The full list of runtime-read variables lives in `apps/api/.env.example`. On
startup, `apps/api/src/config/env-validation.ts` validates the configuration
and fails fast with an aggregated error listing every problem: missing
required URLs, non-HTTPS public URLs in production, placeholder auth or
encryption secrets, and feature variables (e.g. `RESEND_API_KEY` without
`RESEND_FROM_EMAIL`) that an enabled feature needs.

### Security & Rate Limiting

SaviTools protects its REST APIs and WebSocket connections by restricting allowed origins and rate limiting requests:

- **CORS Protection**: The WebSocket gateway and HTTP endpoints restrict incoming connections using `WEB_ORIGIN` (defaulting to `http://localhost:3000`). Make sure this is set to your frontend origin in staging/production deployments.
- **Rate Limiting**: SaviTools implements global rate limiting using `@nestjs/throttler`. By default, it allows a maximum of `100` requests within a `60000` ms (1 minute) sliding window per IP address. When exceeded, the API returns a `429 Too Many Requests` response.
  - Rate limits can be configured in your environment using `THROTTLE_LIMIT` (number of requests) and `THROTTLE_TTL` (time-to-live window in milliseconds).

### Webhook Signature Verification

Every outbound delivery — the Webhook Tester, contract-event replay, and monitor alerts —
uses one signing contract, so a single receiver implementation verifies all of them. Each
delivery is signed whenever a signing secret is in play: the per-request secret if you send
one, otherwise `WEBHOOK_SIGNING_SECRET`. Check what your deployment emits:

```bash
curl http://localhost:3001/api/webhooks/signing
# => {"enabled":true,"algorithm":"hmac-sha256","signatureHeader":"X-SaviTools-Signature",
#     "timestampHeader":"X-SaviTools-Timestamp","replayWindowSeconds":300,
#     "signedPayloadFormat":"<timestamp>.<body>","signatureFormat":"sha256=<hex>",
#     "signedPayloadEncoding":"utf-8","maxSkewSeconds":60,
#     "perRequestSecretSupported":true}
```

Every signed request carries two headers, and nothing else:

- `X-SaviTools-Timestamp`: the Unix time in seconds when the request was built
- `X-SaviTools-Signature`: `sha256=<hex>`, where the hex is HMAC-SHA256 of the UTF-8 bytes
  of `<timestamp>.<body>` — the exact request body as sent

```bash
# Reference verification, straight from the wire.
printf '%s.%s' "$X_SAVITOOLS_TIMESTAMP" "$BODY_BYTES" \
  | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET"
# compare to the X-SaviTools-Signature value, in constant time
```

To verify a signature, recompute the HMAC with your secret over the timestamp and body you
received, compare it in constant time, and reject requests whose timestamp is older than
`replayWindowSeconds` (300 s) or more than `maxSkewSeconds` (60 s) in the future. The API
exposes this exact logic as a testable utility: `apps/api/src/modules/webhook/signature.ts`
(`signBody` / `verifySignature`). A request whose timestamp is older than the replay window
should be rejected as a potential replay.

> If signing is not enabled (`enabled: false`), webhook payloads are sent unsigned — set
> `WEBHOOK_SIGNING_SECRET` before pointing receivers at your deployment. Monitor alerts always
> sign with the per-webhook secret stored for that monitor, never the env var.

#### Migrating from the legacy body-only signature

Earlier builds signed the Webhook Tester's body alone and labelled the result
`X-Webhook-Signature`, alongside an ISO-8601 `X-Timestamp`. That format has no timestamp
inside the MAC, so a captured request could be replayed verbatim, and it does not verify
against the contract above. If you still receive either legacy header:

- **Receivers** must implement the timestamped pair. To keep accepting old deliveries during a
  rollout, try the timestamped verification first and fall back to the body-only HMAC only
  when `X-SaviTools-Timestamp` is absent — then stop, since a request carrying a timestamp
  but failing the timestamped check is a forgery, not a legacy delivery.
- **Senders** do not need to do anything: all three paths emit the new pair, and the old
  headers are no longer produced. Replaying a delivery recorded under the old format strips
  the stale headers and re-signs it under the current contract, and the Webhook Tester marks
  those history entries `legacy` so it is clear the replay no longer matches the original.

### 3. Start infrastructure

```bash
docker compose up -d     # Postgres + Redis (docker-compose.yml)
```

Postgres and Redis are published on **loopback only** (`127.0.0.1`); change
`POSTGRES_PORT` / `REDIS_PORT` in the root `.env` if either port is taken.

#### Two compose files

- `docker-compose.yml` - Postgres + Redis only. Start it with
  `docker compose up -d` (this step) or `make infra`.
- `docker-compose.dev.yml` - Postgres + Redis **plus** the `api` and `web`
  containers. Start it with `make dev`.

Use the second one when you want the whole stack in Docker instead of running
the apps on the host in step 4:

```bash
make dev                                            # full stack in Docker
docker compose -f docker-compose.dev.yml config -q   # validate without starting
```

It caches `node_modules` in named volumes, parameterises every published port,
and starts `web` only once `api` reports healthy, so the first request no
longer races the API's boot.

### 4. Run development servers

```bash
npm run dev
```

| Service      | URL                            |
| ------------ | ------------------------------ |
| Frontend     | http://localhost:3000          |
| API          | http://localhost:3001/api      |
| Swagger docs | http://localhost:3001/api/docs |

### 5. Run individual apps

```bash
cd apps/web && npm run dev    # frontend only
cd apps/api && npm run dev    # API only
```

---

## Development Commands

```bash
npm run dev        # start all apps in watch mode (Turborepo)
npm run build      # production build
npm run lint       # ESLint across all apps
npm run format     # Prettier
npm test           # run all tests
make seed          # seed network_samples, sandbox wallets, and webhook config (requires make dev)
```

---

## How it connects to Savitura

SaviTools is a standalone product with its own users and branding, but it's purpose-built to serve the Savitura ecosystem:

- The **API Playground** is pre-wired to Fluxa and CrowdPay APIs
- The **Webhook Tester** ships sample payloads for every CrowdPay and Fluxa event
- The **Contract Deploy Helper** makes it easy to deploy the CrowdPay Soroban escrow contract
- Connect your Fluxa account in settings to use your real API keys inside SaviTools tools

**Other Savitura projects:**

- [Fluxa](https://github.com/Savitura/Fluxa) — payment infrastructure API
- [CrowdPay](https://github.com/Savitura/crowdpay) — crowdfunding platform

---

## Documentation

Complete guides and API reference for integrating with SaviTools:

| Resource                                                         | Purpose                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **[API Reference](docs/api-reference.md)**                       | Complete endpoint catalog with examples, parameters, and error codes        |
| **[Quickstart Guide](docs/quickstart.md)**                       | End-to-end walkthrough: generate keypair → fund → send payment in 5 minutes |
| **[Ledger Monitor Load Test](docs/ledger-monitor-load-test.md)** | Recorded result from the one-hour, 50-connection SSE load test              |
| **[Swagger UI](/api/docs)**                                      | Interactive API explorer (available in dev/staging; disabled in production) |

### Quick Links

- **Getting an API Key**: See [Quickstart → Step 1-2](docs/quickstart.md)
- **Finding Payment Routes**: See [API Reference → Simulator](docs/api-reference.md#simulator-payment-paths--fees)
- **Building Multi-Op Transactions**: See [API Reference → Composer](docs/api-reference.md#composer-transaction-building)
- **Authentication & Security**: See [API Reference → Authentication](docs/api-reference.md#authentication)
- **Bug Reports**: [https://github.com/Savitura/Savitools/issues](https://github.com/Savitura/Savitools/issues)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

## Observability

The API includes a Prometheus-compatible `GET /metrics` endpoint with HTTP, Soroban RPC, contract invocation, Horizon, Redis, and Node.js runtime metrics. See [API metrics](docs/metrics.md) for access control, Prometheus scrape configuration, and the Grafana dashboard import template.

           ├── federation/        # TOML and address resolution
           ├── metrics/           # Prometheus metrics export
           ├── sandbox/           # Wallet sandbox and Friendbot
           ├── workspace/         # Multi-tenant workspace mgmt
           ├── stellar/           # Stellar network / RPC helpers
