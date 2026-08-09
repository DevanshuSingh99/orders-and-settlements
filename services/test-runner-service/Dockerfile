# Multi-stage build: compile TypeScript, then ship a slim runtime image
# running as a non-root user.
FROM node:22-alpine AS build
WORKDIR /app

COPY tsconfig.base.json ./tsconfig.base.json

# Build shared packages first (file: dependencies).
# Copy manifests before sources so layer cache invalidates correctly.
COPY packages/shared-domain/package.json packages/shared-domain/package-lock.json* ./packages/shared-domain/
COPY packages/shared-domain/tsconfig.json ./packages/shared-domain/
COPY packages/shared-domain/src ./packages/shared-domain/src
COPY packages/shared-domain/jest.config.js ./packages/shared-domain/
WORKDIR /app/packages/shared-domain
RUN npm install && npm run build

# Reset to /app — COPY destinations are relative to WORKDIR.
WORKDIR /app
COPY packages/test-scenarios/package.json packages/test-scenarios/package-lock.json* ./packages/test-scenarios/
COPY packages/test-scenarios/tsconfig.json ./packages/test-scenarios/
COPY packages/test-scenarios/src ./packages/test-scenarios/src
COPY packages/test-scenarios/jest.config.js ./packages/test-scenarios/
WORKDIR /app/packages/test-scenarios
RUN npm install && npm run build

WORKDIR /app
COPY services/test-runner-service/package.json services/test-runner-service/package-lock.json* ./services/test-runner-service/
WORKDIR /app/services/test-runner-service
RUN npm install
COPY services/test-runner-service/tsconfig.json ./
COPY services/test-runner-service/src ./src
COPY services/test-runner-service/jest.config.js ./
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S oas && adduser -S oas -G oas

# Preserve directory depth so file: symlinks in node_modules keep resolving.
COPY --from=build /app/packages/shared-domain /app/packages/shared-domain
COPY --from=build /app/packages/test-scenarios /app/packages/test-scenarios
COPY --from=build /app/services/test-runner-service/node_modules /app/services/test-runner-service/node_modules
COPY --from=build /app/services/test-runner-service/dist /app/services/test-runner-service/dist
COPY --from=build /app/services/test-runner-service/package.json /app/services/test-runner-service/package.json

USER oas
WORKDIR /app/services/test-runner-service
EXPOSE 4004
CMD ["node", "dist/server.js"]
