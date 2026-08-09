FROM node:22-alpine AS build
WORKDIR /app

# tsconfig.json extends this shared base config (see repo root).
COPY tsconfig.base.json ./tsconfig.base.json

COPY packages/shared-domain ./packages/shared-domain
WORKDIR /app/packages/shared-domain
RUN npm install && npm run build

WORKDIR /app/services/orders-service
COPY services/orders-service/package.json services/orders-service/package-lock.json* ./
RUN npm install
COPY services/orders-service .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S oas && adduser -S oas -G oas

# Preserves the same directory depth as the build stage - see auth-service's
# Dockerfile for why (the @oas/shared-domain file: dependency is a relative symlink).
COPY --from=build /app/packages/shared-domain /app/packages/shared-domain
COPY --from=build /app/services/orders-service/node_modules /app/services/orders-service/node_modules
COPY --from=build /app/services/orders-service/dist /app/services/orders-service/dist
COPY --from=build /app/services/orders-service/migrations /app/services/orders-service/migrations
COPY --from=build /app/services/orders-service/package.json /app/services/orders-service/package.json

USER oas
WORKDIR /app/services/orders-service
EXPOSE 4002
CMD ["node", "dist/server.js"]
