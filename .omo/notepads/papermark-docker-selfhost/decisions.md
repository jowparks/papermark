# Decisions — papermark-docker-selfhost

## D1: Two Dockerfile targets (resolves trigger-needs-source vs lean-runtime tension)
The lean Next standalone runtime image does NOT contain trigger.config.ts, lib/trigger/*, or the
prisma CLI — but the `migrate` and `provision-trigger` init services need them.
Resolution: ONE Dockerfile, TWO final targets:
  - `runner` (lean standalone, `node server.js`)  -> used by `app`
  - `tooling` (full source + node_modules + prisma CLI + schema) -> used by `migrate` + `provision-trigger`
Compose selects per-service via `build: { context: ., target: runner|tooling }`. Shared cached layers,
no extra build cost. provision-tinybird stays on python:3.12-slim (separate).

## D2: INTERNAL_API_KEY + REVALIDATE_TOKEN are OPERATOR-SUPPLIED (not gen-secrets-generated)
§8.2 requires these mirrored into the Trigger.dev dashboard so the cloud worker's callbacks to
/api/mupdf + presign authenticate. If gen-secrets generated them randomly in-container the operator
could never set the matching value in the Trigger dashboard -> rendering silently 401s. So:
  - INTERNAL_API_KEY, REVALIDATE_TOKEN: operator sets in .env AND Trigger dashboard (gen via `openssl rand -hex 32`, documented).
  - gen-secrets.sh ONLY generates the purely-internal trio (NEXTAUTH_SECRET,
    NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY, NEXT_PRIVATE_VERIFICATION_SECRET) into /secrets/app.env if absent.
This is NOT re-litigating architecture; it fixes an internal §8.1/§8.2 inconsistency the plan itself flags.

## D3: NEXT_PUBLIC_* must be Docker build ARGs (Next inlines them at build, not runtime)
NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_MARKETING_URL / NEXT_PUBLIC_APP_BASE_HOST / NEXT_PUBLIC_UPLOAD_TRANSPORT
are inlined into the client bundle at build time. Passing them only via env_file (runtime) would bake
`undefined` into the client bundle -> broken client-side base URLs/share links. So Dockerfile build
stage declares ARG+ENV for them before `next build`; compose passes them via build.args from ${...}
(compose auto-reads .env for interpolation).
