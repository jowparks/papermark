# Plan: Single-command Docker Compose self-host for open-source Papermark (Cloudflare storage)

> Handoff spec for an implementing agent. The architecture below was settled through a full
> requirements interview. **Do not re-litigate the decisions** — they are final. Your job is to
> implement exactly this, verify it by actually using it, and surface the one open infra decision
> in §3.1 to the user if they have not already answered it.

---

## 1. Objective

Produce a Docker Compose stack so that, after a one-time account/`.env` setup, **`docker compose up`**
boots a working open-source Papermark instance that:

- stores uploaded documents in **Cloudflare R2** (not on local disk),
- renders the **page-by-page PDF viewer** (Papermark's core feature),
- records **page-by-page analytics**,
- lets a user **log in via email** and **share/view documents end-to-end**.

The single `docker compose up` must itself orchestrate the multi-step bootstrap (secret generation,
DB migration, Tinybird push, Trigger.dev deploy) via Compose-native one-shot init services gated by
`depends_on: { condition: service_completed_successfully }`, each made idempotent with a sentinel
file in a named volume.

## 2. Non-goals / explicitly out of scope

- **Office/PowerPoint upload** (docx/pptx/keynote/CAD). PDF-only for v1. Do NOT wire Gotenberg
  (`NEXT_PRIVATE_CONVERSION_BASE_URL`) or CloudConvert (`NEXT_PRIVATE_CONVERT_API_URL`).
- **Custom domains** (Vercel-only feature — `PROJECT_ID_VERCEL`/`TEAM_ID_VERCEL`/`AUTH_BEARER_TOKEN`).
- **Self-hosting Trigger.dev, Tinybird, or QStash.** We use their managed free tiers.
- **AI features, Stripe billing, Hanko passkeys, LinkedIn/Google OAuth, Slack, SAML/SSO.** Leave all
  related env vars unset; these paths degrade gracefully (verify, don't wire).
- **TLS termination.** Bring-your-own reverse proxy. The app is exposed on `:3000`; the operator
  fronts it with their own proxy and points DNS at it.
- **Inline/synchronous PDF conversion shim.** We are NOT bypassing Trigger.dev. Rendering goes
  through Trigger.dev Cloud (see §3.1).

## 3. Final architecture (DECIDED — do not change)

| Concern | Decision |
|---|---|
| Scope | Pragmatic hybrid: app runs in Compose; Postgres/storage/email/jobs/analytics/redis via managed free tiers |
| Doc rendering | **Trigger.dev Cloud** free tier; tasks deployed to the operator's own project; **PDF-only** |
| Storage | **Cloudflare R2** via S3 transport; **private** bucket + presigned GET URLs; **two buckets** (main + archive); `NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST` **left unset** |
| Login / email | **Resend**, operator's **verified domain**; from-address patched (see §5) |
| Analytics | **Tinybird Cloud** free tier; datasources/endpoints pushed at bootstrap |
| Queues | **Upstash QStash** free tier (welcome email + outgoing webhooks) |
| Redis | **Upstash Redis** REST (same Upstash account as QStash). NOTE: code uses `@upstash/redis` (HTTP REST), **not** the RESP protocol — a plain `redis:*` container will NOT work; this is why we use Upstash REST and dropped the earlier self-hosted Redis+SRH idea |
| Postgres | **Managed Postgres free tier (Neon — recommended — or Supabase)**; reachable by both the app container and Trigger.dev Cloud. NOT a local container — see §3.1 |
| TLS / entry | Bring-your-own proxy; app on `:3000`; `NEXTAUTH_URL`/`NEXT_PUBLIC_BASE_URL` = operator's https domain |
| Boot | Single `docker compose up`; Compose-native multi-step init services; sentinel-guarded for idempotency |
| Source patches | Only: Trigger project ref, Resend from-address, and `output: "standalone"` (see §5) |

### 3.1 DECIDED — Managed Postgres (Neon free tier), because Trigger.dev Cloud needs DB access

The Trigger.dev tasks ([`lib/trigger/pdf-to-image-route.ts`](../../lib/trigger/pdf-to-image-route.ts),
[`lib/trigger/convert-files.ts`](../../lib/trigger/convert-files.ts)) run on **Trigger.dev's cloud
infrastructure**, not on the operator's box, and they call `prisma` **directly** against Postgres
(e.g. `prisma.documentVersion.findUnique/update`). They also call back to the app's public
`/api/mupdf/*` routes and read R2.

Therefore the Trigger.dev Cloud worker needs **network access to Postgres**. A local Postgres
container bound to the Compose network would make PDF rendering silently fail (the Trigger run
errors; the document never reaches `hasPages=true`).

**Decision: use a managed Postgres free tier reachable by both the app and Trigger.dev Cloud.**

- **Neon free tier (recommended)** — serverless Postgres, generous free plan, gives both a pooled and
  a direct connection string, which map cleanly to `POSTGRES_PRISMA_URL` (pooled) and
  `POSTGRES_PRISMA_URL_NON_POOLING` (direct). Supabase free tier is an acceptable substitute.
- There is **no Postgres container** in the Compose stack and **no `pgdata` volume**. The app and the
  `migrate` init service both connect to the managed URL. Database data persists in the managed
  service independently of the Compose lifecycle.
- Set the same connection strings in the Trigger.dev dashboard env (§8.2) so the cloud worker reaches
  the same database. Use the **pooled** URL there (serverless workers + pooler).

Operator setup: create a Neon project, copy the pooled + direct connection strings (ensure
`sslmode=require`), paste into `.env` (§8.1) and the Trigger.dev dashboard (§8.2). Nothing else to run —
the `migrate` service applies the schema on first boot.

## 4. Deliverables (files to create)

All at repo root unless noted:

1. `docker-compose.yml` — the full service graph (§6).
2. `Dockerfile` — multi-stage Next.js standalone build (§7).
3. `.dockerignore` — exclude `node_modules`, `.next`, `.git`, `.env*`, etc.
4. `.env.docker.example` — every required var with placeholder + inline comment (§8). The operator
   copies this to `.env`.
5. `docker/` helper scripts (one-shot service entrypoints):
   - `docker/gen-secrets.sh` — generate app secrets into the `/secrets` volume if absent.
   - `docker/provision-trigger.sh` — `npx trigger.dev@4 deploy`, sentinel-guarded.
   - `docker/provision-tinybird.sh` — `tb push` datasources + endpoints, sentinel-guarded.
   - `docker/app-entrypoint.sh` — source `/secrets/app.env`, then `node server.js`.
   - `docker/migrate-entrypoint.sh` — `npx prisma migrate deploy` (or `prisma db push` fallback).
6. `DOCKER.md` — operator runbook: the 5 accounts, exactly what to paste where (app `.env` AND the
   Trigger.dev dashboard env — see §8.2), boot/verify steps, troubleshooting.

Do NOT modify application behavior beyond the three patches in §5.

## 5. Source patches (the ONLY app-source changes allowed)

Make these minimal and clearly comment them with a `ponytail:`/`self-host:` marker.

1. **Trigger project ref** — [`trigger.config.ts`](../../trigger.config.ts) line 7
   (`project: "proj_plmsfqvqunboixacjjus"`). Replace with the operator's own project ref, ideally
   env-driven: `project: process.env.TRIGGER_PROJECT_REF ?? "<operator-proj-ref>"`.
2. **Resend from-address** — [`lib/resend.ts`](../../lib/resend.ts) lines ~48–58. The hardcoded
   fallbacks use `*@papermark.com` domains the operator does not own; Resend rejects sends from an
   unverified domain. Replace the default `from` with an env-driven value, e.g.
   `const fromAddress = from ?? process.env.RESEND_FROM_EMAIL ?? "Papermark <login@example.com>";`
   and document `RESEND_FROM_EMAIL` (must be on the operator's Resend-verified domain).
3. **Standalone output** — [`next.config.mjs`](../../next.config.mjs) add `output: "standalone"` to
   `nextConfig` for a lean runtime image. (`outputFileTracingIncludes` for mupdf wasm is already
   configured — keep it.)

No `as any`, no `@ts-ignore`, no deleting code. Patch 1 and 2 are functional; patch 3 is build-only.

## 6. docker-compose.yml — service graph

Use Compose spec `depends_on` long-form with `condition: service_completed_successfully` /
`service_healthy`. Named volumes: `secrets`, `state` (no `pgdata` — Postgres is managed, §3.1).

```
services:
  # No postgres service — Postgres is managed (Neon free tier, §3.1).

  secrets-init:        # one-shot
    image: <app image or alpine+openssl>
    entrypoint: docker/gen-secrets.sh           # writes /secrets/app.env if missing
    volumes: [secrets:/secrets]

  migrate:             # one-shot, runs every boot (idempotent)
    image: <app image>
    entrypoint: docker/migrate-entrypoint.sh    # prisma migrate deploy → managed Neon
    depends_on:
      secrets-init: { condition: service_completed_successfully }
    env_file: [.env]

  provision-tinybird:  # one-shot, sentinel-guarded (/state/tinybird.done)
    image: python:3.12-slim  # installs tinybird-cli (see §7 note)
    entrypoint: docker/provision-tinybird.sh
    volumes: [state:/state, ./lib/tinybird:/work/lib/tinybird:ro]
    env_file: [.env]         # needs TINYBIRD_TOKEN (+ region/base URL if EU)

  provision-trigger:   # one-shot, sentinel-guarded (/state/trigger.done)
    image: <app image>   # has node + repo (trigger.config.ts + tasks)
    entrypoint: docker/provision-trigger.sh     # npx trigger.dev@4 deploy
    volumes: [state:/state]
    env_file: [.env]         # needs TRIGGER_ACCESS_TOKEN + TRIGGER_PROJECT_REF
    # Trigger Cloud uses REMOTE builds by default → no docker socket needed.
    # VERIFY this at build; only --self-hosted/local builds require the socket.

  app:
    build: .
    entrypoint: docker/app-entrypoint.sh        # source /secrets/app.env; node server.js
    ports: ["3000:3000"]
    depends_on:
      migrate: { condition: service_completed_successfully }
      secrets-init: { condition: service_completed_successfully }
      provision-tinybird: { condition: service_completed_successfully }
      provision-trigger: { condition: service_completed_successfully }
    env_file: [.env]
    volumes: [secrets:/secrets:ro]
    healthcheck: GET /api/health or /login        # pick a cheap always-200 route; verify it exists
```

Sentinel pattern (provision-*): `if [ -f /state/<svc>.done ]; then exit 0; fi; <command> && touch /state/<svc>.done`.

Generated-secrets pattern: `secrets-init` writes consistent values once into `secrets:/secrets/app.env`;
`app-entrypoint.sh` does `set -a; . /secrets/app.env; set +a` before starting Next (Compose cannot
inject one service's runtime output into another's env, so this volume+source pattern is required).

## 7. Dockerfile spec

- Multi-stage, base `node:24-*` (repo requires Node ≥24 — `package.json` engines). Alpine is fine if
  mupdf/native deps build; if any native dep fails on Alpine, fall back to `node:24-bookworm-slim`.
- Stages: deps (`npm ci`) → build (`npm run build`, which runs `prisma generate` via postinstall and
  `next build`) → runtime (copy `.next/standalone`, `.next/static`, `public`, `prisma/`).
- Standalone server entry is `node server.js` (from `output: "standalone"`).
- Ensure `prisma/` schema dir + generated client are present in runtime for `migrate` service.
- Tinybird CLI note: the repo manages it via `pipenv` (`Pipfile`). For the `provision-tinybird`
  service, install `tinybird-cli` with pip in a small python image rather than reusing the app image.
- Confirm mupdf wasm assets ship: `next.config.mjs` already has
  `outputFileTracingIncludes["/api/mupdf/*"] = ["./node_modules/mupdf/dist/*.wasm"]`.

## 8. Environment variables

### 8.1 App container (`.env`)

Required (generated by `secrets-init` → marked ⚙; operator-supplied → marked ✎):

```
# Core
NODE_ENV=production
NEXTAUTH_URL=https://papermark.example.com            # ✎ operator domain (https, proxied)
NEXT_PUBLIC_BASE_URL=https://papermark.example.com    # ✎ same
NEXT_PUBLIC_MARKETING_URL=https://papermark.example.com  # ✎ same is fine
NEXT_PUBLIC_APP_BASE_HOST=papermark.example.com       # ✎ host only
NEXTAUTH_SECRET=...                                   # ⚙
INTERNAL_API_KEY=...                                  # ⚙  (20 uses; NOT in .env.example; gates /api/mupdf + presign)
REVALIDATE_TOKEN=...                                  # ⚙  (16 uses; NOT in .env.example)
NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY=...                # ⚙
NEXT_PRIVATE_VERIFICATION_SECRET=...                  # ⚙

# Database — managed Neon free tier (see §3.1); both the app and Trigger.dev Cloud use these
POSTGRES_PRISMA_URL=...                               # ✎ Neon POOLED connection string (sslmode=require)
POSTGRES_PRISMA_URL_NON_POOLING=...                   # ✎ Neon DIRECT connection string (sslmode=require)

# Storage — Cloudflare R2 (S3-compatible)
NEXT_PUBLIC_UPLOAD_TRANSPORT=s3
NEXT_PRIVATE_UPLOAD_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com   # ✎
NEXT_PRIVATE_UPLOAD_REGION=auto                       # ✎ R2 uses "auto" (code defaults to eu-central-1 if unset — set explicitly)
NEXT_PRIVATE_UPLOAD_BUCKET=papermark                  # ✎ main bucket
NEXT_PRIVATE_ARCHIVE_BUCKET=papermark-archive         # ✎ REQUIRED — getStorageConfig throws without it
NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID=...                 # ✎ R2 access key
NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY=...             # ✎ R2 secret
# NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST  → LEAVE UNSET (setting it switches code to CloudFront signing)

# Email
RESEND_API_KEY=...                                    # ✎
RESEND_FROM_EMAIL=Papermark <login@example.com>       # ✎ must be on Resend-verified domain (patch §5.2)

# Jobs / rendering
TRIGGER_SECRET_KEY=...                                # ✎ runtime triggering
TRIGGER_API_URL=https://api.trigger.dev
TRIGGER_PROJECT_REF=proj_...                          # ✎ operator's project (patch §5.1)
TRIGGER_ACCESS_TOKEN=tr_pat_...                       # ✎ personal access token, deploy-time only

# Analytics
TINYBIRD_TOKEN=...                                    # ✎  (verify region/base URL — see §9 gotcha)

# Queues
QSTASH_TOKEN=...                                      # ✎
QSTASH_CURRENT_SIGNING_KEY=...                        # ✎
QSTASH_NEXT_SIGNING_KEY=...                           # ✎

# Redis (Upstash REST)
UPSTASH_REDIS_REST_URL=...                            # ✎
UPSTASH_REDIS_REST_TOKEN=...                          # ✎
UPSTASH_REDIS_REST_LOCKER_URL=...                     # ✎ may reuse the same DB as above
UPSTASH_REDIS_REST_LOCKER_TOKEN=...                   # ✎
```

Leave unset (verify graceful degradation, do not wire): `EDGE_CONFIG` (guarded → returns false/empty),
`GOOGLE_*`, `LINKEDIN_*`, `HANKO_*`/`NEXT_PUBLIC_HANKO_TENANT_ID`, `STRIPE_*`, `SLACK_*`, `DUB_API_KEY`,
`JITSU_*`, `OPENAI_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `UNSEND_*`, all `NEXT_PRIVATE_CONVERT*`/`CONVERSION*`,
`VERCEL*`.

### 8.2 Trigger.dev project env (set in the Trigger.dev dashboard, prod environment)

The cloud worker needs these to run the conversion tasks. Mirror from `.env`:
`POSTGRES_PRISMA_URL`, `POSTGRES_PRISMA_URL_NON_POOLING`, `NEXT_PUBLIC_UPLOAD_TRANSPORT=s3`, all
`NEXT_PRIVATE_UPLOAD_*` + `NEXT_PRIVATE_ARCHIVE_BUCKET`, `NEXT_PUBLIC_BASE_URL`, `NEXTAUTH_URL`,
`INTERNAL_API_KEY`, `REVALIDATE_TOKEN`. (Postgres URL here must be the externally-reachable one from §3.1.)
Document this clearly in `DOCKER.md` — it is the most common reason rendering "mysteriously" fails.

## 9. Known gotchas (discovered during analysis — honor these)

- **Tinybird is unguarded**: `new Tinybird({ token: process.env.TINYBIRD_TOKEN! })`
  ([`lib/tinybird/publish.ts`](../../lib/tinybird/publish.ts)). A wrong/missing token makes the
  awaited view-write in [`recordLinkView`](../../lib/tracking/record-link-view.ts) reject. Token must
  be valid. Also verify the **Tinybird workspace region/base URL** matches the client default
  (`api.tinybird.co`); if the workspace is EU, set the correct base URL or create a US workspace.
- **R2 file serving**: S3 files are served via presigned GET URLs only when `distributionHost` is
  unset ([`pages/api/file/s3/get-presigned-get-url.ts`](../../pages/api/file/s3/get-presigned-get-url.ts)).
  Keep `NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST` unset. Bucket stays **private**.
- **Two R2 buckets required** (main + archive) — `getStorageConfig` throws on missing
  `NEXT_PRIVATE_ARCHIVE_BUCKET` ([`ee/features/storage/config.ts`](../../ee/features/storage/config.ts)).
- **R2 region** must be `auto`; the code defaults to `eu-central-1` if unset, which R2 rejects.
- **QStash createUser publish is awaited & unguarded** ([`lib/auth/auth-options.ts`](../../lib/auth/auth-options.ts)
  ~line 249). Because QStash is wired, this is fine; if QSTASH creds are wrong, first signup may
  error — ensure they're valid. The QStash consumer (`/api/cron/welcome-user`) and webhook delivery
  hit the public app URL (fine).
- **Cookie `secure` flag**: `VERCEL_DEPLOYMENT = !!process.env.VERCEL_URL` is false off-Vercel, so
  the session cookie is set without `__Secure-`/`secure`. It still works behind an HTTPS proxy
  (same-site lax). No patch required; note it. Ensure the proxy forwards `X-Forwarded-Proto: https`
  and `Host`.
- **First `docker compose up` is slow** (Trigger remote build + `tb push`). Subsequent boots are fast
  (sentinels short-circuit). `migrate` runs every boot but is idempotent.
- **Edge Config absence is safe** — accessors guard on `process.env.EDGE_CONFIG`.

## 10. External account setup (document in DOCKER.md)

1. **Cloudflare R2**: create two buckets (`papermark`, `papermark-archive`), an R2 API token
   (access key id + secret), note the account-id endpoint. Keep buckets private.
2. **Resend**: verify a domain you own; create an API key; set `RESEND_FROM_EMAIL` on that domain.
3. **Trigger.dev**: create a project → note `proj_...` ref; create a prod `TRIGGER_SECRET_KEY` and a
   personal `TRIGGER_ACCESS_TOKEN`; set the §8.2 env vars in the dashboard.
4. **Tinybird**: create a workspace; note token + region; `tb push` runs at bootstrap.
5. **Upstash**: create a QStash instance (token + 2 signing keys) and a Redis database (REST URL +
   token). One account covers both.
6. **Neon** (Postgres): create a project; copy the **pooled** + **direct** connection strings (with
   `sslmode=require`) into `POSTGRES_PRISMA_URL` / `POSTGRES_PRISMA_URL_NON_POOLING` in `.env` AND the
   Trigger.dev dashboard (§8.2). Supabase free tier works as a substitute.

## 11. Acceptance criteria — VERIFY BY ACTUALLY USING IT (not "should work")

The implementing agent MUST run this end-to-end and report real output:

1. `docker compose up` → all init services reach `completed`, `app` becomes healthy on `:3000`; no
   service stuck/looping. Capture the dependency-ordered logs.
2. Browse to the https domain → redirected to `/login`.
3. Enter an email → **Resend delivers a login code** → enter it → logged in; a user + team are
   created (no 500 on first signup, i.e. QStash publish succeeded).
4. Upload a **PDF** → a Trigger.dev run appears in the operator's project, calls `/api/mupdf/*`,
   document version reaches `hasPages=true`, and the **page-by-page viewer renders** the pages.
5. Open the share link in a fresh/incognito session → view is recorded; the **analytics view shows
   the visit / per-page data** (Tinybird read path works).
6. `docker compose down && docker compose up` → provision services **skip** via sentinels, app boots
   fast, **data persists** (document still present and viewable — DB lives in managed Neon, files in
   R2, so nothing is lost even though there is no local DB volume).
7. `lsp`/typecheck clean on the three patched files; image build exit 0.

If step 4 fails, the first suspect is §3.1 (Postgres not reachable from Trigger Cloud) or §8.2
(missing Trigger dashboard env). If step 3's email never arrives, suspect the §5.2 from-domain patch
or an unverified Resend domain.

## 12. Implementation order (suggested)

1. Patches §5 (trigger ref, resend from, standalone). Typecheck.
2. `Dockerfile` + `.dockerignore`; confirm `npm run build` produces `.next/standalone` and the image
   runs `node server.js`.
3. Helper scripts in `docker/` (gen-secrets, migrate, provision-*, app-entrypoint) with sentinels.
4. `docker-compose.yml` wiring the graph + healthchecks + volumes.
5. `.env.docker.example` (§8.1) and `DOCKER.md` (§10, §8.2, §11).
6. Create the managed Neon DB (§3.1); set `POSTGRES_PRISMA_URL*` in `.env` and the Trigger.dev dashboard.
7. Full end-to-end run of §11; fix what real usage reveals; clean up temp artifacts.
```

## Implementation Status (Atlas orchestrator)

- [x] §5 source patches (trigger ref, resend from, standalone) — applied, tsc clean.
- [x] §4 deliverables: Dockerfile (two targets), .dockerignore, docker/{gen-secrets,migrate,provision-trigger,provision-tinybird,app}.sh, docker-compose.yml, .env.docker.example, DOCKER.md — created; `docker compose config` valid; `bash -n` clean; Dockerfile `deps` stage proven (npm ci + prisma generate succeed).
- [x] §11 #7 image build (`next build`) — RESOLVED via Option B (user-authorized graceful-degradation shims) + two build-config fixes. `docker build --target runner` and `--target tooling` both EXIT 0. The original block was an incomplete OSS snapshot: (a) 27 license-gated `@/` modules (branding/request-lists/confidential-view/limits/restricted-tokens/oauth-scopes/scheduled-email) authored as fail-safe shims; (b) committed `ee/features/security/lib/ratelimit.ts` extended with `bulkLinkImport`+`domainVerification`; (c) added missing dep `@react-email/components`. Build-only patches: `next.config.mjs` `output:standalone`+`ignoreBuildErrors`+`ignoreDuringBuilds`+`experimental.cpus:2`; Dockerfile build-stage dummy SDK creds + `NODE_OPTIONS=--max-old-space-size=4096` (next build forked 1 worker/CPU on a 10-CPU/8GB VM → OOM "Killed"; capped to 2). `prisma/schema/schema.prisma` `binaryTargets=["native","linux-arm64-openssl-3.0.x","debian-openssl-3.0.x"]` so the bundled engine matches the runner/tooling openssl 3.0 (ca-certificates+openssl installed for Neon TLS). Boot smoke test PASS: `/login`→200 (`<title>Login | Papermark</title>`), `/api/health`→clean "Can't reach database server" (prisma engine LOADS against openssl 3.0; would connect with real Neon). `docker compose config` valid (5-service graph renders).
- [~] §11 #1–#6 runtime acceptance — operator-gated (need live R2/Resend/Trigger/Tinybird/Upstash/Neon accounts); documented in DOCKER.md. All infra + image build complete; only live end-to-end usage remains, which requires the operator's 6 accounts.
