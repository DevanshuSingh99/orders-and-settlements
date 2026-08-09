FROM node:22-alpine AS build
WORKDIR /app

# tsconfig.json extends this shared base config (see repo root).
COPY tsconfig.base.json ./tsconfig.base.json

COPY packages/shared-domain ./packages/shared-domain
WORKDIR /app/packages/shared-domain
RUN npm install && npm run build

WORKDIR /app/gateway
COPY gateway/package.json gateway/package-lock.json* ./
RUN npm install
COPY gateway .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S oas && adduser -S oas -G oas

# Preserves the same directory depth as the build stage - see auth-service's
# Dockerfile for why (the @oas/shared-domain file: dependency is a relative symlink).
COPY --from=build /app/packages/shared-domain /app/packages/shared-domain
COPY --from=build /app/gateway/node_modules /app/gateway/node_modules
COPY --from=build /app/gateway/dist /app/gateway/dist
COPY --from=build /app/gateway/package.json /app/gateway/package.json

USER oas
WORKDIR /app/gateway
EXPOSE 4000
CMD ["node", "dist/server.js"]
