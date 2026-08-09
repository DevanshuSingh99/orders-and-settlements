.PHONY: up down logs ps build test seed migrate deploy

# Local development / CI: build and start every service, wait for health.
up:
	docker compose up -d --build
	@echo "Gateway:     http://localhost:4000"
	@echo "Test runner: http://localhost:4004"
	@echo "Postgres:    localhost:5432"
	@echo "Redis:       localhost:6379"
	@echo "App UI:      cd web && npm run dev"
	@echo "Test UI:     cd test-web && npm run dev   # http://localhost:3001"

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

build:
	docker compose build

# Seeds the demo account (see scripts/seed.mjs) against a running stack.
seed:
	API_BASE_URL=http://localhost:4000 node scripts/seed.mjs

# Runs migrations for all three services against whichever DATABASE_URL is
# active in env/.env (defaults to localhost - see env/.env.example).
migrate:
	cd services/auth-service && npm run migrate
	cd services/orders-service && npm run migrate
	cd services/payments-service && npm run migrate

# Production deploy on the VM: uses the VM's existing Redis/Postgres and
# adds Caddy for TLS. See docker-compose.prod.yml and the Deployment
# section of the README for the env values that must be filled in first.
deploy:
	docker compose -f docker-compose.prod.yml up -d --build
