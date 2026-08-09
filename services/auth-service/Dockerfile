# Multi-stage build: compile TypeScript, then ship a slim runtime image
# running as a non-root user.
FROM node:22-alpine AS build
WORKDIR /app

# tsconfig.json extends this shared base config (see repo root).
COPY tsconfig.base.json ./tsconfig.base.json

# Build the shared-domain package first since auth-service depends on it via file:.
COPY packages/shared-domain ./packages/shared-domain
WORKDIR /app/packages/shared-domain
RUN npm install && npm run build

WORKDIR /app/services/auth-service
COPY services/auth-service/package.json services/auth-service/package-lock.json* ./
RUN npm install
COPY services/auth-service .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S oas && adduser -S oas -G oas

# Preserves the same directory depth as the build stage
# (/app/services/auth-service, /app/packages/shared-domain) because the
# @oas/shared-domain "file:" dependency in node_modules is a RELATIVE
# symlink computed at that depth - flattening the layout here would break it.
COPY --from=build /app/packages/shared-domain /app/packages/shared-domain
COPY --from=build /app/services/auth-service/node_modules /app/services/auth-service/node_modules
COPY --from=build /app/services/auth-service/dist /app/services/auth-service/dist
COPY --from=build /app/services/auth-service/migrations /app/services/auth-service/migrations
COPY --from=build /app/services/auth-service/package.json /app/services/auth-service/package.json

USER oas
WORKDIR /app/services/auth-service
EXPOSE 4001
CMD ["node", "dist/server.js"]
