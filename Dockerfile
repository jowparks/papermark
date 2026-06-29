# syntax=docker/dockerfile:1
# Papermark self-host image. ONE Dockerfile, two final targets (decision D1):
#   runner  -> lean Next.js standalone runtime (node server.js) for the `app` service
#   tooling -> full source + node_modules + prisma CLI for migrate / provision-trigger
#
# Build:
#   docker build --target runner  -t papermark-runner  [--build-arg NEXT_PUBLIC_*=...] .
#   docker build --target tooling -t papermark-tooling .

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------------------------------------------------------------------------
# deps: install node_modules. Copy package manifests + prisma schema BEFORE
# npm ci so the `postinstall: prisma generate` step finds prisma/schema.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------------------------------------------------------------------------
# build: full source + `npm run build`. NEXT_PUBLIC_* are inlined into the
# client bundle at build time (decision D3), so they must be ARG/ENV here.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# self-host: bound the build compiler's V8 heap so it GCs instead of ballooning
# past the build host's RAM during `next build` (paired with experimental.cpus=2).
ENV NODE_OPTIONS=--max-old-space-size=4096

ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_MARKETING_URL
ARG NEXT_PUBLIC_APP_BASE_HOST
ARG NEXT_PUBLIC_UPLOAD_TRANSPORT
ARG NEXT_PUBLIC_SIGNING_HOST
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}
ENV NEXT_PUBLIC_MARKETING_URL=${NEXT_PUBLIC_MARKETING_URL}
ENV NEXT_PUBLIC_APP_BASE_HOST=${NEXT_PUBLIC_APP_BASE_HOST}
ENV NEXT_PUBLIC_UPLOAD_TRANSPORT=${NEXT_PUBLIC_UPLOAD_TRANSPORT}
# Documenso URL for embedded signing. NEXT_PUBLIC_ -> inlined at build time even
# in server-only lib/signing/client.ts; empty falls back to app.documenso.com.
ENV NEXT_PUBLIC_SIGNING_HOST=${NEXT_PUBLIC_SIGNING_HOST}
# Required: next.config.mjs header rule does a `host` match on this var and
# Next fails the build if it is undefined. Reserved .invalid host never matches
# a real Host, so the (unused) webhook feature stays effectively off.
ENV NEXT_PUBLIC_WEBHOOK_BASE_HOST=webhooks.invalid
# self-host: build-only dummy creds so module-scope SDK clients (OpenAI / Stripe / Upstash /
# QStash / Tinybird) don't throw during `next build` "Collecting page data". These are NOT
# NEXT_PUBLIC_, so they are never inlined and never exist in the runtime `runner` stage; real
# values come from .env at runtime. Only constructors run at build — no network calls.
ENV OPENAI_API_KEY=sk-build-dummy-not-used-at-runtime
ENV STRIPE_SECRET_KEY=sk_test_builddummy
ENV STRIPE_SECRET_KEY_OLD=sk_test_builddummy
ENV UPSTASH_REDIS_REST_URL=https://dummy-build.upstash.io
ENV UPSTASH_REDIS_REST_TOKEN=builddummy
ENV UPSTASH_REDIS_REST_LOCKER_URL=https://dummy-build.upstash.io
ENV UPSTASH_REDIS_REST_LOCKER_TOKEN=builddummy
ENV QSTASH_TOKEN=builddummy
ENV QSTASH_CURRENT_SIGNING_KEY=sig_builddummy
ENV QSTASH_NEXT_SIGNING_KEY=sig_builddummy
ENV TINYBIRD_TOKEN=builddummy
# More module-scope eager constructs surfaced during page-data collection:
# lib/hanko.ts throws if HANKO vars unset; slack/events.ts module-scope `new SlackEventManager()`
# -> new SlackClient() throws; tus routes `new MultiRegionS3Store()` -> getStorageConfig() throws on
# missing NEXT_PRIVATE_UPLOAD_* (EU only; US is try/caught); lib/dub.ts `new Dub()`. All build-only.
ENV HANKO_API_KEY=builddummy
ENV NEXT_PUBLIC_HANKO_TENANT_ID=00000000-0000-0000-0000-000000000000
ENV SLACK_CLIENT_ID=builddummy
ENV SLACK_CLIENT_SECRET=builddummy
ENV DUB_API_KEY=dub_builddummy
ENV NEXT_PRIVATE_UPLOAD_BUCKET=build-dummy-bucket
ENV NEXT_PRIVATE_ARCHIVE_BUCKET=build-dummy-archive
ENV NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID=builddummy
ENV NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY=builddummy

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# runner: lean standalone runtime for the `app` service.
# Standalone traces only what server.js needs; we additionally carry the
# prisma client + query engine and the mupdf wasm (outputFileTracingIncludes).
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# self-host: runtime needs CA certs for TLS to managed Neon Postgres (sslmode=require)
# and openssl so Prisma's query engine loads cleanly.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# Next standalone server + static assets + public dir.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Prisma generated client + query engine (standalone tracing can miss .prisma).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/node_modules/prisma ./node_modules/prisma

# Schema (some runtime paths read it). All secrets now arrive via .env at
# runtime, so the runner needs no helper scripts — start the server directly.
COPY --from=build /app/prisma ./prisma

EXPOSE 3000
ENTRYPOINT ["node", "server.js"]

# ---------------------------------------------------------------------------
# tooling: full source + full node_modules + prisma CLI + trigger CLI source.
# Used by `migrate` (prisma migrate deploy) and `provision-trigger`
# (npx trigger.dev@4 deploy, remote builds — no docker socket needed).
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS tooling
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY . .
ENTRYPOINT ["/bin/sh"]
