#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT_DIR/docker-compose.prod.yml")
ENV_FILE="$ROOT_DIR/env/.env.prod"
SEED_DEMO=false

usage() {
  cat <<'EOF'
Usage:
  bash scripts/deploy-prod.sh [--seed]

Options:
  --seed   Create/update the demo account and sample orders.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --seed) SEED_DEMO=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

require_file() {
  test -f "$1" || {
    echo "Required file not found: $1" >&2
    exit 1
  }
}

require_command docker
require_file "$ENV_FILE"

grep -Eq '^DATABASE_URL=.*@postgres:[0-9]+/' "$ENV_FILE" || {
  echo "DATABASE_URL in env/.env.prod must point to the Compose postgres service." >&2
  exit 1
}
grep -Eq '^REDIS_URL=redis://(.*@)?redis(:[0-9]+)?' "$ENV_FILE" || {
  echo "REDIS_URL in env/.env.prod must point to the Compose redis service." >&2
  exit 1
}
for required_var in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB; do
  grep -Eq "^${required_var}=.+" "$ENV_FILE" || {
    echo "${required_var} must be set in env/.env.prod." >&2
    exit 1
  }
done

cd "$ROOT_DIR"

echo "Building production images..."
"${COMPOSE[@]}" build

echo "Starting isolated PostgreSQL and Redis..."
"${COMPOSE[@]}" up -d postgres redis

wait_for_health() {
  local service="$1"
  local container
  local status

  container="$("${COMPOSE[@]}" ps -q "$service")"
  for _ in $(seq 1 60); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' "$container")"
    case "$status" in
      healthy) return 0 ;;
      unhealthy)
        echo "$service became unhealthy." >&2
        "${COMPOSE[@]}" logs --tail=100 "$service" >&2
        exit 1
        ;;
    esac
    sleep 2
  done

  echo "Timed out waiting for $service to become healthy." >&2
  "${COMPOSE[@]}" logs --tail=100 "$service" >&2
  exit 1
}

wait_for_health postgres
wait_for_health redis

echo "Applying database migrations..."
"${COMPOSE[@]}" run --rm --no-deps auth-service node dist/db/migrate.js
"${COMPOSE[@]}" run --rm --no-deps orders-service node dist/db/migrate.js
"${COMPOSE[@]}" run --rm --no-deps payments-service node dist/db/migrate.js

echo "Starting backend services..."
"${COMPOSE[@]}" up -d --build --force-recreate \
  auth-service orders-service payments-service gateway test-runner-service

if [[ "$SEED_DEMO" == true ]]; then
  require_command node
  echo "Seeding demo account and sample orders..."
  API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:4050}" node scripts/seed.mjs
fi

echo
echo "Production deployment completed."
echo "Gateway:     http://127.0.0.1:4050/health"
echo "Test runner: http://127.0.0.1:4054/health"
echo "Use Nginx/Cloudflare domains for public HTTPS access."
if [[ "$SEED_DEMO" == true ]]; then
  echo "Demo app login: demo@example.com / demo-password-123"
fi
echo "Test dashboard credentials: read TEST_RUNNER_USER and TEST_RUNNER_PASSWORD from env/.env.prod."
