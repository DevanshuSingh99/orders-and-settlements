FROM node:22-alpine AS build
WORKDIR /app

# tsconfig.json extends this shared base config (see repo root).
COPY tsconfig.base.json ./tsconfig.base.json

COPY packages/shared-domain ./packages/shared-domain
WORKDIR /app/packages/shared-domain
RUN npm install && npm run build

WORKDIR /app/services/payments-service
COPY services/payments-service/package.json services/payments-service/package-lock.json* ./
RUN npm install
COPY services/payments-service .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S oas && adduser -S oas -G oas

# Preserves the same directory depth as the build stage - see auth-service's
# Dockerfile for why (the @oas/shared-domain file: dependency is a relative symlink).
COPY --from=build /app/packages/shared-domain /app/packages/shared-domain
COPY --from=build /app/services/payments-service/node_modules /app/services/payments-service/node_modules
COPY --from=build /app/services/payments-service/dist /app/services/payments-service/dist
COPY --from=build /app/services/payments-service/migrations /app/services/payments-service/migrations
COPY --from=build /app/services/payments-service/package.json /app/services/payments-service/package.json

USER oas
WORKDIR /app/services/payments-service
EXPOSE 4003
CMD ["node", "dist/server.js"]
