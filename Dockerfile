# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
ARG PNPM_VERSION=11.19.0

FROM ${NODE_IMAGE} AS toolchain
ARG PNPM_VERSION

ENV COREPACK_HOME=/corepack \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:${PATH}

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
    && chmod -R a+rX /corepack

WORKDIR /app

FROM toolchain AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN --mount=type=cache,id=filedrop-pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
    && pnpm install --frozen-lockfile \
    && pnpm rebuild @prisma/engines \
    && ls node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/schema-engine-linux-*-openssl-3.0.x >/dev/null

FROM dependencies AS builder

COPY . .

# These are intentionally non-secret build placeholders. Next.js evaluates
# server modules while collecting build data, but it does not connect to this
# address. Real production values are injected only when the container starts.
ENV APP_URL=http://localhost:3000 \
    DATABASE_URL=postgresql://filedrop:build-only@127.0.0.1:5432/filedrop \
    NEXT_OUTPUT=standalone

RUN mkdir -p public \
    && pnpm db:generate \
    && pnpm build

# Fail the image build if a future Next.js or Prisma upgrade omits a runtime
# dependency from output tracing.
RUN test -f .next/standalone/server.js \
    && test -d .next/static \
    && test -f .next/standalone/node_modules/@prisma/client/runtime/client.js \
    && test -f .next/standalone/node_modules/@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs \
    && test -f .next/standalone/node_modules/@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs \
    && test -f .next/standalone/node_modules/pg/package.json \
    && cd .next/standalone \
    && node --input-type=module -e "await import('@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs'); const wasm = await import('@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs'); await import('pg'); if (typeof wasm.wasm !== 'string' || wasm.wasm.length < 1000000) process.exit(1)"

FROM dependencies AS operations

ENV HOME=/tmp \
    NODE_ENV=production

COPY . .

USER node

CMD ["pnpm", "db:migrate:deploy"]

FROM ${NODE_IMAGE} AS runtime

ARG APP_REVISION=unknown

LABEL org.opencontainers.image.source="https://github.com/Mikaela0127/FileDrop" \
      org.opencontainers.image.revision="${APP_REVISION}" \
      org.opencontainers.image.title="FileDrop"

ENV APP_REVISION=${APP_REVISION} \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

RUN mkdir -p /app/.next/cache /app/public \
    && chown -R node:node /app

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/deploy/container-healthcheck.mjs ./container-healthcheck.mjs

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "/app/container-healthcheck.mjs"]

CMD ["node", "server.js"]
