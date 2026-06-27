# Papermark Self-Host — Debug Handoff

> Purpose: hand a **clean agent** everything needed to verify the Dockerized
> Papermark self-host end-to-end and debug whatever isn't working.
> Read this top-to-bottom, then start at **§9 First moves**.
>
> Secrets are NOT in this file. They live in the gitignored `/Users/joe/repos/papermark/.env`.
> This file references `.env` KEYS; read `.env` for values.

---

## 1. What this is

A self-hosted [Papermark](https://github.com/mfts/papermark) (open-source DocSend
alternative) running via **Docker Compose**, fronted by a **Cloudflare Tunnel**
container, served publicly at **https://papermark.ebbhealth.com**.

All infra is external/managed (no local Postgres). The goal end-to-end flow:
**login (magic link) → upload PDF → pages render → view document → analytics recorded.**

Status at handoff: built, all credentials live-verified, Tinybird provisioned.
**Not yet confirmed:** a full runtime pass (login→upload→render→analytics) through
the public URL. That's the debugging job.

---

## 2. Architecture

### Compose services (`docker-compose.yml`) — 6 total
| service | type | role | gating |
| --- | --- | --- | --- |
| `secrets-init` | one-shot | generates the internal secret trio into the `secrets` volume | file check |
| `migrate` | one-shot | `prisma migrate deploy` against Neon | runs every boot, idempotent |
| `provision-tinybird` | one-shot | deploys Tinybird **Forward** datasources+endpoints | sentinel `/state/tinybird.done` |
| `provision-trigger` | one-shot | `trigger.dev@4 deploy` to Trigger.dev Cloud (PROD) | sentinel `/state/trigger.done` |
| `app` | long-running | Next.js standalone (`node server.js`), port 3000 | starts only after the 4 one-shots succeed; has healthcheck |
| `cloudflared` | long-running | Cloudflare Tunnel → publishes `app` publicly | `depends_on: app healthy` |

- `app` exposes `3000:3000` on the host (optional once the tunnel is up).
- `cloudflared` reaches the app over the compose network as `http://app:3000`.
- Volumes: `secrets` (the trio), `state` (provision sentinels).

### External / managed services
| service | what | key env (.env) |
| --- | --- | --- |
| **Neon** Postgres | pooled + direct conn strings | `POSTGRES_PRISMA_URL` (pooled, `-pooler` host), `POSTGRES_PRISMA_URL_NON_POOLING` (direct) |
| **Cloudflare R2** | S3-compatible storage, 2 private buckets | `NEXT_PRIVATE_UPLOAD_*`, endpoint `https://c4e31cbcaa4253325dd74ec47beafe66.r2.cloudflarestorage.com`, region `auto`, buckets `papermark` + `papermark-archive` |
| **Resend** | magic-link + system email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (`Papermark <login@papermark.ebbhealth.com>`, domain verified) |
| **Trigger.dev Cloud** | PDF page render tasks (PROD env) | `TRIGGER_SECRET_KEY` (`tr_prod_…`), `TRIGGER_PROJECT_REF` (`proj_bixnfoowillczjgifkdc`), `TRIGGER_ACCESS_TOKEN` (`tr_pat_…`, deploy only) |
| **Tinybird Forward** | analytics (views, page durations) | `TINYBIRD_TOKEN`, `TINYBIRD_HOST` (`https://api.us-east.aws.tinybird.co`) |
| **Upstash** | QStash (queues) + Redis (locks) | `QSTASH_*`, `UPSTASH_REDIS_REST_*` (+ `_LOCKER_` reuse same DB) |
| **Cloudflare Tunnel** | public ingress | `TUNNEL_TOKEN`; tunnel name `papermark`, id `9a04e124-6de4-466a-bfea-5166d9640621` |

---

## 3. Public access (Cloudflare Tunnel)

- Tunnel `papermark` was **migrated** from locally-managed to **remotely-managed**
  (token-based). The `cloudflared` container runs `tunnel run --token ${TUNNEL_TOKEN}`.
- **Ingress is configured in the Cloudflare dashboard**, NOT a local config file.
  Required route: **Zero Trust → Networks → Connectors → papermark →
  "Published application routes" → `papermark.ebbhealth.com` → Service `http://app:3000`.**
  - ⚠️ This is the one manual step that may still be pending. Without it the public
    URL returns Cloudflare error **1033 / "no ingress"** even though the tunnel connects.
  - "Hostname routes (Beta)" is the WRONG tab (that's WARP/private routing). Use
    **Published application routes**.
- DNS CNAME for `papermark.ebbhealth.com` already exists (created via `cloudflared tunnel route dns`).
- `ebbhealth.com` is a full Cloudflare zone. Resend records live on `send.*` /
  `resend._domainkey.*` and do not conflict.

---

## 4. Trigger.dev dashboard env (CRITICAL, easy to forget)

The Trigger **Cloud worker** runs render tasks in Trigger's infra, NOT in this
compose stack, so it needs its **own** copy of env vars set in the Trigger
dashboard → Project → **Production** environment (deploy targets prod because the
runtime key is `tr_prod_`).

Required (values come from `.env`; see also `DOCKER.md` §8.2):
```
POSTGRES_PRISMA_URL (pooled)         NEXT_PRIVATE_UPLOAD_BUCKET=papermark
POSTGRES_PRISMA_URL_NON_POOLING      NEXT_PRIVATE_ARCHIVE_BUCKET=papermark-archive
NEXT_PUBLIC_UPLOAD_TRANSPORT=s3      NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID
NEXT_PRIVATE_UPLOAD_ENDPOINT         NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY
NEXT_PRIVATE_UPLOAD_REGION=auto      NEXT_PUBLIC_BASE_URL=https://papermark.ebbhealth.com
INTERNAL_API_KEY  (MUST match .env)  NEXTAUTH_URL=https://papermark.ebbhealth.com
REVALIDATE_TOKEN  (MUST match .env)
```
Plus safety-net (tasks share the codebase): `TINYBIRD_TOKEN`+`TINYBIRD_HOST`,
`RESEND_API_KEY`+`RESEND_FROM_EMAIL`, `UPSTASH_REDIS_REST_*` (+LOCKER),
`QSTASH_*`, and the non-empty placeholders (`HANKO_API_KEY`,
`NEXT_PUBLIC_HANKO_TENANT_ID`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`(+`_OLD`),
`SLACK_CLIENT_ID/SECRET`, `DUB_API_KEY`).

- `INTERNAL_API_KEY` / `REVALIDATE_TOKEN` authenticate the worker's callbacks to
  the app (`/api/mupdf`, revalidation). **Mismatch → rendering callbacks 401.**

---

## 5. Boot procedure

No rebuild is needed for the recent Tinybird fix (script + datafiles are
bind-mounted). Rebuild only if you change `NEXT_PUBLIC_*` (baked at build time).

```sh
cd /Users/joe/repos/papermark

# (first build, or after NEXT_PUBLIC_* / Dockerfile changes)
docker compose build

docker compose up -d
docker compose ps
docker compose logs -f secrets-init migrate provision-tinybird provision-trigger
docker compose logs -f app cloudflared
```

Boot is slow the FIRST time (Trigger remote build). Later boots are fast
(sentinels in the `state` volume short-circuit the provisioners).

---

## 6. Per-component verification (the debugging core)

Run these to localize a failure. `200`/clean = good.

```sh
# --- app health (inside the box) ---
curl -s http://localhost:3000/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login        # 200

# --- through the tunnel (public path the Trigger worker uses) ---
curl -s -o /dev/null -w '%{http_code}\n' https://papermark.ebbhealth.com/login   # 200
curl -s https://papermark.ebbhealth.com/api/health
cloudflared tunnel info papermark    # should show active connections

# --- Neon reachable (from inside migrate/app) ---
docker compose logs migrate | tail -30        # expect "migrations applied" / no conn error

# --- R2 buckets ---
# uses aws cli on host with the same creds from .env
aws s3 ls --endpoint-url https://c4e31cbcaa4253325dd74ec47beafe66.r2.cloudflarestorage.com
#   (expects: papermark, papermark-archive)

# --- Tinybird Forward resources (resource existence; 404 = missing) ---
TB_TOKEN=$(grep -E '^TINYBIRD_TOKEN=' .env | head -1 | cut -d= -f2-)
TB_HOST=$(grep -E '^TINYBIRD_HOST=' .env | head -1 | cut -d= -f2-)
for n in page_views__v3 click_events__v1 pm_click_events__v1 video_views__v1 webhook_events__v1; do
  echo "ds $n -> $(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TB_TOKEN" "$TB_HOST/v0/datasources/$n")"
done
# pipes: get_total_average_page_duration__v5, get_page_duration_per_view__v5,
#        get_useragent_per_view__v2, get_useragent_per_view__v3, get_webhook_events__v1, etc.

# --- Trigger deploy present ---
docker compose logs provision-trigger | tail -40    # expect a successful deploy, no DATABASE_URL fatal
```

### What "working end-to-end" looks like
1. `https://papermark.ebbhealth.com/login` loads, magic-link email arrives (Resend).
2. Upload a PDF → a Trigger **run** appears in the Trigger.dev dashboard (Runs view).
3. Run succeeds → page-by-page viewer renders the document.
4. Open the share link → a view is recorded; analytics populate (Tinybird).

---

## 7. Tinybird: Classic → Forward port (most recent change, subtle)

The workspace is **Tinybird Forward**; the original provisioning used the
**Classic** CLI (`tb push`) which Forward rejects. Ported this session:

- Provisioner `docker/provision-tinybird.sh` now installs the **Forward** CLI
  (`curl https://tinybird.co | sh`, NOT `pip install tinybird-cli`) and runs
  `tb --cloud --host … --token … deploy`. It is **best-effort**: a failed deploy
  prints a loud warning and `exit 0` (so `app` still boots); the sentinel is
  written only on success.
- Datafiles in `lib/tinybird/{datasources,endpoints}/` were **renamed to their
  runtime-contract names** (the `__vN` suffix that Classic auto-generated from
  `VERSION N`). `VERSION` headers stripped; `TYPE ENDPOINT` added; `FROM` refs fixed.
  - Contract source of truth = `lib/tinybird/publish.ts` (datasource names) and
    `lib/tinybird/pipes.ts` (pipe names). **Do NOT rename resources away from these.**
  - New file `lib/tinybird/endpoints/get_useragent_per_view__v2.pipe` was created
    (v2 is used by `pages/api/.../[viewId]/user-agent.ts` and `lib/trigger/export-visits.ts`).
  - New `lib/tinybird/tinybird.config.json` (`{}`).
- **Verified live**: all 5 datasources + 16 endpoints return 200 at their exact
  contract names; unsuffixed base names 404 (proving the suffix is the real name).
- `tb datasource ls` / `pipe ls` STRIP the `__vN` suffix in display — verify
  existence via the REST API (`/v0/pipes/<name>` , `/v0/datasources/<name>`), not `ls`.

---

## 8. Other non-obvious fixes already made this session

(All in the working tree; understand these before "fixing" them again.)

- **`prisma/schema/schema.prisma`** generator `binaryTargets =
  ["native","linux-arm64-openssl-3.0.x","debian-openssl-3.0.x"]` — runner/tooling
  images install openssl 3.0, so Prisma needs the 3.0.x engine bundled.
- **Build OOM fix**: `next.config.mjs` `experimental.cpus: 2` + Dockerfile build
  stage `ENV NODE_OPTIONS=--max-old-space-size=4096` (VM is 10 CPU / 8 GB; default
  parallelism SIGKILLed during "Collecting page data").
- **Tinybird region patch**: `lib/tinybird/{publish,pipes}.ts` pass
  `baseUrl: process.env.TINYBIRD_HOST` to the `@chronark/zod-bird` client (zod-bird
  defaults to `api.tinybird.co` and 403s on a regional token). This is the only
  diff in those two files — names are unchanged.
- **QStash region**: `QSTASH_URL=https://qstash-us-east-1.upstash.io` in `.env`
  (the global host 404s for this account). `@upstash/qstash` reads `QSTASH_URL`
  from env — no code patch needed.
- **`.env` URL block** points at `https://papermark.ebbhealth.com` (not localhost).
- **3 secrets intentionally blank in `.env`** (auto-generated by `secrets-init` on
  first boot): `NEXTAUTH_SECRET`, `NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY`,
  `NEXT_PRIVATE_VERIFICATION_SECRET`.
- **Placeholder env that must stay NON-EMPTY** (import-time guards throw on blank;
  a blank `HANKO_*` breaks ALL login via `lib/auth/auth-options.ts`):
  `HANKO_API_KEY`, `NEXT_PUBLIC_HANKO_TENANT_ID`, `OPENAI_API_KEY`,
  `STRIPE_SECRET_KEY`(+`_OLD`), `SLACK_CLIENT_ID/SECRET`, `DUB_API_KEY`.
- **Host Node is v20 (<24)** → never `npm run build` / `prisma generate` on the
  host. Build ONLY in Docker. `psql`/`aws`/`cloudflared` are installed on the host.

---

## 9. First moves (start here)

1. `docker compose ps` — is everything up? Did any one-shot exit non-zero?
   - `provision-*` show `Exit 0` (completed) = good. `Exit 1` = read its logs.
2. `curl -s http://localhost:3000/api/health` — app alive locally?
3. `curl -s -o /dev/null -w '%{http_code}\n' https://papermark.ebbhealth.com/login`
   — public path. If not 200 / error 1033 → the **Published application route**
   (§3) isn't set, or `cloudflared` isn't running.
4. If app is up: open `https://papermark.ebbhealth.com/login`, request a magic
   link, upload a PDF, and watch the **Trigger.dev Runs** dashboard.
5. Localize any failure with the symptom map below.

---

## 10. Troubleshooting map (symptom → cause → fix)

| symptom | likely cause | fix |
| --- | --- | --- |
| Stack won't boot; `app` never starts | a one-shot provisioner exited non-zero | `docker compose logs <provisioner>`; fix; `up` again |
| Public URL = Cloudflare 1033 / "no ingress" | tunnel connected but no Published-application-route | add route → `http://app:3000` (§3) |
| Public URL 502 but localhost 200 | tunnel started before app healthy | `docker compose restart cloudflared` (it waits for app health) |
| `cloudflared` container crash-loops | `TUNNEL_TOKEN` blank/wrong in `.env` | `cloudflared tunnel token papermark` → update `.env` |
| Login page loads, no email | Resend creds / from-domain | check `app` logs; `RESEND_FROM_EMAIL` domain is verified |
| Login works, session immediately drops | secure cookies need HTTPS + correct `Host`/`X-Forwarded-Proto` | the tunnel provides this; verify `NEXTAUTH_URL` is the public https URL |
| First signup fails | `createUser` awaits a QStash publish; bad QStash creds | verify `QSTASH_*` (and `QSTASH_URL` region) |
| Upload works, pages never render | Trigger dashboard env unset (PROD), or `INTERNAL_API_KEY`/`REVALIDATE_TOKEN` mismatch | set §4 vars in Trigger dashboard PROD; keys must match `.env` |
| Rendering silently fails, no error | Trigger worker can't reach Neon, or wrong DB | use the **pooled** Neon URL in the dashboard |
| Upload/download fails on R2 | region must be `auto`; both buckets exist & private; `NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST` must stay UNSET | check `.env` R2 block |
| Analytics empty / events rejected | Tinybird resource missing or region/token mismatch | run §6 Tinybird REST check; confirm `TINYBIRD_HOST` |
| `provision-tinybird` warns "NOT PROVISIONED" but boots | best-effort path hit a deploy error | read the error above the banner; re-run after fixing (sentinel was NOT written) |
| Re-run a provisioner | delete its sentinel | `docker compose run --rm provision-tinybird sh -c 'rm -f /state/tinybird.done'` (same for `trigger.done`) |

---

## 11. File map

| path | what |
| --- | --- |
| `.env` | live secrets (gitignored). Source of truth for all values. |
| `.env.docker.example` | template incl. `TUNNEL_TOKEN`, Forward Tinybird notes |
| `docker-compose.yml` | 6-service stack incl. `cloudflared` |
| `Dockerfile` | `runner` (app) + `tooling` (provisioners) targets; build-stage `NODE_OPTIONS` |
| `DOCKER.md` | full self-host runbook (§8.2 Trigger env, §10 tunnel) |
| `docker/provision-tinybird.sh` | Forward deploy, best-effort |
| `docker/provision-trigger.sh` | `trigger.dev@4 deploy` (no `--env` → prod) |
| `docker/gen-secrets.sh`, `docker/migrate-entrypoint.sh`, `docker/app-entrypoint.sh` | one-shots / entrypoint |
| `lib/tinybird/{datasources,endpoints}/*` | Forward datafiles (renamed to `__vN` contract names) |
| `lib/tinybird/{publish,pipes}.ts` | runtime Tinybird clients (region patch; resource-name contract) |
| `lib/tinybird/tinybird.config.json` | Forward project marker (`{}`) |
| `next.config.mjs` | `experimental.cpus: 2` (OOM) |
| `prisma/schema/schema.prisma` | `binaryTargets` for openssl 3.0.x |
| `~/.cloudflared/` | host tunnel creds (now superseded by the container/token) |

---

## 12. Git / uncommitted state

The working tree has **uncommitted** changes (the whole Docker self-host effort +
the Tinybird Forward port). `lib/tinybird` datafiles were renamed (git sees
deletes + adds). Nothing is committed yet — run `git status` to see scope. Do not
commit `.env` (it is gitignored; verify it stays that way).

---

## 13. One-line status at handoff

R2 ✓ · Neon ✓ · Resend ✓ · Trigger PROD deploy ✓ · Redis/QStash ✓ ·
**Tinybird Forward provisioned ✓** · `cloudflared` container wired ✓ ·
**pending:** Published-application-route → `http://app:3000`, and the full
runtime pass (login → upload → render → analytics) through the public URL.
