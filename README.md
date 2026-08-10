# Orders & Settlements

B2B orders and settlements: create orders with line items, record payments and refunds, and track status and amount due on a dashboard.

Users register, build orders (customer, due date, quantities, unit prices), and settle them with full/partial payments or refunds. Totals are computed server-side; status is derived from net paid + due date; overpay/over-refund is rejected even under concurrent requests.

Design notes from before implementation: [docs/implementation-plan.md](docs/implementation-plan.md).

**Demo account** (after `make seed`): `demo@example.com` / `demo-password-123`

---

## Why microservices

Split into small services so each piece can scale and deploy on its own, and a failure in one area doesn’t take down the whole system, not one single point of failure / blast radius for the whole app.

Gateway is the public entry: auth, orders, and payments stay separate behind it. Each service owns its schema and re-verifies JWTs itself (doesn’t trust the gateway alone).

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| API | Node.js + TypeScript + Express | Typed, fast to iterate, one language across services |
| Frontends | Next.js (static export) + Tailwind v4 + HeroUI | SPA-friendly static deploy, shared UI kit |
| DB | PostgreSQL via `pg` (no ORM) | Strong constraints + row locks for money invariants |
| Cache | Redis | Refresh sessions, gateway rate limits, test-runner run locks |
| Auth | Argon2id + JWT access + httpOnly refresh cookies | Standard session pattern without stuffing secrets in localStorage |
| Edge / TLS | Caddy | Auto HTTPS in prod compose |
| Tests | Jest + Supertest | Unit + integration against real Postgres/Redis |
| Ops | Docker Compose, GitHub Actions | Local stack + CI parity |

---

## Databases

**One Postgres instance** (`oas`), **one schema per service**: `auth`, `orders`, `payments`. Services share `DATABASE_URL` and set `search_path` on connect.

**Redis** for:

- Auth refresh-token sessions
- Gateway fixed-window rate limiting
- Test-runner run state + single-flight load locks

Payment concurrency does **not** use Redis locks — it uses guarded SQL (below).

---

## Layout

```text
orders-and-settlements/
  packages/shared-domain/     money, status, JWT, errors, audit action names
  packages/test-scenarios/    declarative browser-suite scenarios
  gateway/                    public API (:4000)
  services/auth-service/      (:4001)
  services/orders-service/    (:4002)
  services/payments-service/  (:4003) — payments + refunds
  services/test-runner-service/ (:4004) — suites + load (gated)
  web/                        product UI (:3000)
  test-web/                   test dashboard (:3001)
  env/                        shared backend env (see .env.example)
  scripts/seed.mjs
  docker-compose.yml          local Postgres + Redis + services
  docker-compose.prod.yml     VM deploy (host Postgres/Redis + Caddy)
```

---

## Services

| Service | Role |
|---|---|
| **gateway** | JWT check, rate limit, request IDs, proxy to auth/orders/payments |
| **auth-service** | Register / login / refresh / logout; users + auth audit |
| **orders-service** | Orders, line items, dashboard summary, CSV export |
| **payments-service** | Payments + refunds, updates `orders.paid_amount_cents` under guard |
| **test-runner-service** | Password-gated suite runner + server-side load; hits live gateway |

Shared domain lives in `packages/shared-domain` so money math and status rules stay identical across services.

---

## Web UI vs Test Web UI

**`web/`** — product app. Orders dashboard, create/edit, payments & refunds, CSV export. Talks only to the gateway (`NEXT_PUBLIC_API_BASE_URL`, default `http://localhost:4000`).

```bash
cp web/env/.env.example web/env/.env
cd web && npm install && npm run dev   # http://localhost:3000
```

**`test-web/`** — reviewer/demo dashboard. Run declarative suites (allocation, status, overpay, concurrency, idempotency, refunds, …) and load tests with status/latency histograms and error breakdowns. Talks to test-runner (`NEXT_PUBLIC_TEST_API_BASE_URL`, default `http://localhost:4004`).

```bash
# Needs make up with TEST_RUNNER_ENABLED=true
cp test-web/env/.env.example test-web/env/.env
cd test-web && npm install && npm run dev   # http://localhost:3001
```

Gate creds: `TEST_RUNNER_USER` / `TEST_RUNNER_PASSWORD` in `env/.env` (see `env/.env.example`). Leave `TEST_RUNNER_ENABLED=false` on public deploys unless you intentionally expose `test-api.example.com`.

---

## Domain logic worth knowing

- **Money in cents** — `BIGINT` everywhere; API uses decimals (≤2 places). Converted at the boundary in `packages/shared-domain` (`toCents` / `fromCents`); no float math.
- **Status is derived, not stored** — `paid` → else `overdue` → else `partially_paid` → else `pending`. Shared TS + matching SQL `CASE` in orders-service (consistency test).
- **Stored `paid_amount_cents`** — aggregate on the order row, updated only by payments-service in the same transaction as the payment/refund insert.
- **Overpay / over-refund rejected** — clear errors with remaining / max refundable amount.
- **Refunds** — separate append-only `refunds` table (positive amounts), not negative payments.
- **Idempotency** — optional `Idempotency-Key` on payment/refund POST; unique `(user_id, key)` indexes; replays return the original row.
- **CSV export** — `GET /api/orders/export` requires a due-date range; max 10k rows per request; `X-Export-*` headers for chunk stitching (client up to 100k).
- **Editability** — financial fields editable only while net paid is `0`; full refund to zero re-opens edits. Payments/refunds themselves are never deleted.

---

## Concurrency

No `SELECT … FOR UPDATE` in the payment path. Concurrency safety is a **guarded atomic UPDATE** inside a transaction, plus CHECK constraints.

Payment:

```sql
UPDATE orders.orders
   SET paid_amount_cents = paid_amount_cents + $amount, updated_at = now()
 WHERE id = $orderId AND user_id = $userId
   AND paid_amount_cents + $amount <= total_cents
RETURNING …;
```

Refund (mirror):

```sql
… SET paid_amount_cents = paid_amount_cents - $amount …
 WHERE … AND paid_amount_cents - $amount >= 0
```

Postgres serializes conflicting row updates; the loser re-evaluates the `WHERE` and gets zero rows → `409` with the right error. Schema also has `CHECK (paid_amount_cents >= 0)` and `paid_not_over_total`. Covered by real concurrent HTTP tests in payments-service.

**Tradeoff:** payments-service writes across schemas into `orders.orders` so the invariant stays in one DB transaction (avoids a network saga).

---

## Audit logs

Each service has an append-only `audit_logs` table (no update/delete path). Writes usually share the business transaction.

| Service | Actions |
|---|---|
| auth | `USER_REGISTERED`, `USER_LOGIN`, `USER_LOGIN_FAILED`, `USER_LOGOUT`, `TOKEN_REFRESHED` |
| orders | `ORDER_CREATED`, `ORDER_UPDATED`, `ORDER_DELETED`, `ORDER_EDIT_REJECTED` |
| payments | `PAYMENT_RECORDED`, `PAYMENT_REJECTED`, `PAYMENT_REFUNDED` |

Metadata never stores passwords, raw tokens, or full request bodies.

---

## Run locally

**Prereqs:** Node 22+, Docker Compose.

```bash
cp env/.env.example env/.env
cp env/.env.example env/.env.dev
cp web/env/.env.example web/env/.env
cp test-web/env/.env.example test-web/env/.env

make up      # builds/starts stack; migrations run as compose one-shots
make seed    # demo user + sample orders via the real API

cd web && npm install && npm run dev              # :3000
# optional:
cd test-web && npm install && npm run dev         # :3001
```

| What | Where |
|---|---|
| Gateway | http://localhost:4000 |
| Test runner | http://localhost:4004 |
| Postgres | localhost:5432 (`oas_app` / `oas_app_password`, db `oas`) |
| Redis | localhost:6379 |

Other Make targets: `make down`, `make logs`, `make migrate` (host-side npm migrate against `DATABASE_URL`), `make deploy`.

Backend services share `env/` (`.env` / `.env.dev` / `.env.prod`). Frontends keep their own `env/` folders (build-time `NEXT_PUBLIC_*`).

---

## Production notes

The production stack owns its own PostgreSQL and Redis containers. It does not
publish either database port, so it cannot conflict with other applications on
the VM. Nginx runs on the VM and proxies the public HTTPS domains to gateway
`:4050` and test-runner `:4054`.

### First-time VM setup

Install Git, Docker Engine, Docker Compose, Node.js 22+, and Nginx on the VM,
then clone the repository:

```bash
cd /var/www
git clone YOUR_REPOSITORY_URL orders-and-settlements
cd orders-and-settlements
```

Create the production environment files:

```bash
cp env/.env.example env/.env.prod
cp web/env/.env.example web/env/.env.prod
cp test-web/env/.env.example test-web/env/.env.prod
chmod 600 env/.env.prod web/env/.env.prod test-web/env/.env.prod
```

Edit `env/.env.prod` and replace the placeholders. The database and Redis
URLs must use the Compose service names:

```env
POSTGRES_USER=oas_app
POSTGRES_PASSWORD=REPLACE_WITH_A_STRONG_PASSWORD
POSTGRES_DB=oas
DATABASE_URL=postgres://oas_app:REPLACE_WITH_A_STRONG_PASSWORD@postgres:5432/oas
REDIS_URL=redis://redis:6379

GATEWAY_PORT=4050
AUTH_PORT=4051
ORDERS_PORT=4052
PAYMENTS_PORT=4053
TEST_RUNNER_PORT=4054
AUTH_SERVICE_URL=http://auth-service:4051
ORDERS_SERVICE_URL=http://orders-service:4052
PAYMENTS_SERVICE_URL=http://payments-service:4053
PUBLIC_API_BASE_URL=http://gateway:4050

CORS_ORIGINS=https://YOUR_WEB_DOMAIN,https://YOUR_TEST_WEB_DOMAIN
TEST_RUNNER_ENABLED=true
TEST_RUNNER_USER=REPLACE_WITH_TEST_USERNAME
TEST_RUNNER_PASSWORD=REPLACE_WITH_TEST_PASSWORD
TEST_RUNNER_JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
```

Set the frontend build-time API URLs in the two frontend env files:

```env
# web/env/.env.prod
NEXT_PUBLIC_API_BASE_URL=https://YOUR_API_DOMAIN

# test-web/env/.env.prod
NEXT_PUBLIC_TEST_API_BASE_URL=https://YOUR_TEST_API_DOMAIN
```

Generate secrets with:

```bash
openssl rand -hex 32
```

### One-command deployment

This command builds the backend images, starts the isolated PostgreSQL and
Redis containers, waits for them to become healthy, runs auth/orders/payments
migrations in the correct order, starts all backend services, and seeds the
demo account and sample orders:

```bash
bash scripts/deploy-prod.sh --seed
```

The same workflow is available as:

```bash
make deploy-prod
```

The demo account is:

```text
Email:    demo@example.com
Password: demo-password-123
```

The deployment command prints these demo credentials when `--seed` is used.
They are application credentials for the normal web frontend.

The test dashboard uses a separate credential pair. It is not generated by
the migration scripts and is intentionally not hard-coded in the application.
Set it before deployment:

```env
TEST_RUNNER_USER=choose-a-test-dashboard-username
TEST_RUNNER_PASSWORD=choose-a-strong-test-dashboard-password
```

To retrieve the configured test-dashboard credentials on the VM:

```bash
grep -E '^TEST_RUNNER_(USER|PASSWORD)=' env/.env.prod
```

Use those values at the test frontend login screen. Do not use the
`change-me-test-runner` example value in a real deployment. If the credentials
are changed later, recreate the test-runner container:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate test-runner-service
```

The script intentionally does not run migrations as long-lived Compose
services. It runs each migration as an explicit one-shot release operation.
To deploy without demo data, omit `--seed`.

### Frontend deployment

The `web` and `test-web` applications are deployed separately through their
Cloudflare Pages Git-connected projects. Cloudflare automatically builds and
deploys them when their configured repository branch changes. The backend
deployment script does not contain Cloudflare credentials or upload logic.

### After deployment

Configure DNS and Nginx for the API domains, then verify:

```bash
docker compose -f docker-compose.prod.yml ps
curl http://127.0.0.1:4050/health
curl http://127.0.0.1:4054/health
curl https://YOUR_API_DOMAIN/health
curl https://YOUR_TEST_API_DOMAIN/health
```

For future releases, pull the latest code and rerun the same command:

```bash
cd /var/www/orders-and-settlements
git pull
bash scripts/deploy-prod.sh --seed
```

---

## Tests

```bash
cd packages/shared-domain && npm test
cd packages/test-scenarios && npm test
cd services/auth-service && npm test
cd services/orders-service && npm test
cd services/payments-service && npm test
cd services/test-runner-service && npm test
cd gateway && npm test
```

CI (`.github/workflows/ci.yml`) runs install / lint / typecheck / test / build against real Postgres + Redis.
