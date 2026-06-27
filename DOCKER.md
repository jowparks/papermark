# Papermark Self-Host (Docker Compose)

A single `docker compose up` boots a working Papermark that:

- stores documents in **Cloudflare R2** (S3-compatible, presigned GET, private buckets),
- renders the page-by-page PDF viewer via **Trigger.dev Cloud**,
- records analytics via **Tinybird**,
- supports **email (magic-link) login** via **Resend**,
- uses a managed **Neon** Postgres (no local DB container).

Bootstrap runs through Compose-native one-shot init services, each idempotent:

| service              | what it does                                  | idempotency        |
| -------------------- | --------------------------------------------- | ------------------ |
| `secrets-init`       | generates internal secret trio                | file check         |
| `migrate`            | `prisma migrate deploy` against Neon          | safe every boot    |
| `provision-tinybird` | `tb --cloud deploy` (Forward) datasources + endpoints | `state` sentinel |
| `provision-trigger`  | `trigger.dev@4 deploy` to Trigger.dev Cloud   | `state` sentinel   |
| `app`                | Next.js standalone runtime (`node server.js`) | healthcheck gated  |

`app` starts only after all four init services exit successfully.

---

## 1. Prerequisites

- Docker Engine + Docker Compose v2.
- Six external accounts (next section).
- A public HTTPS entry point in front of `app:3000` that forwards `Host` and
  `X-Forwarded-Proto: https` (NextAuth secure cookies require this off-Vercel).
  The bundled **`cloudflared`** service (§10) is the turnkey option — it gives
  you HTTPS + a public hostname with no port to expose. Or bring your own
  reverse proxy / load balancer and remove the `cloudflared` service.

---

## 2. The 6 external accounts

| # | Service                | You need                                                                 |
| - | ---------------------- | ------------------------------------------------------------------------ |
| 1 | **Cloudflare R2**      | Account id, an Access Key ID + Secret, and **two** private buckets       |
| 2 | **Resend**             | API key + a **verified sending domain**                                  |
| 3 | **Trigger.dev** Cloud  | Project ref (`proj_...`), runtime secret key (`tr_...`), PAT (`tr_pat_...`) |
| 4 | **Tinybird**           | Workspace admin token (and region/host if not the default)               |
| 5 | **Upstash**            | QStash token + signing keys, and a Redis (REST URL + token)              |
| 6 | **Neon**               | A Postgres database — POOLED and DIRECT connection strings               |

### 2.1 Cloudflare R2

- Create two **private** buckets, e.g. `papermark` and `papermark-archive`
  (both required — the storage config throws without the archive bucket).
- Create an R2 API token (Access Key ID + Secret Access Key).
- Endpoint is `https://<accountid>.r2.cloudflarestorage.com`.
- Region **must** be `auto` (the AWS SDK default `eu-central-1` is rejected by R2).
- **Do not** set `NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST` — leaving it unset keeps
  Papermark on the presigned-GET path so the buckets can stay private.

### 2.2 Resend

- Verify your sending domain.
- `RESEND_FROM_EMAIL` must be on that verified domain, e.g.
  `Papermark <login@yourdomain.com>`.

### 2.3 Trigger.dev Cloud

- Create a project; copy its ref (`proj_...`) → `TRIGGER_PROJECT_REF`.
- Copy a runtime secret key (`tr_...`) → `TRIGGER_SECRET_KEY`.
- Create a Personal Access Token (`tr_pat_...`) → `TRIGGER_ACCESS_TOKEN`
  (used only at deploy time by `provision-trigger`).
- **Dashboard env vars (critical) — see §8.2 below.**

### 2.4 Tinybird (Forward)

- Workspaces are now **Tinybird Forward** (Classic can no longer be created).
- Create a workspace, copy the admin token → `TINYBIRD_TOKEN`.
- If your workspace is **not** on the default `api.tinybird.co` region, set
  `TINYBIRD_HOST` to your region URL (e.g. us-east aws →
  `https://api.us-east.aws.tinybird.co`). A token/region mismatch makes
  `recordLinkView` silently reject events.
- `provision-tinybird` installs the **Forward** CLI (`curl https://tinybird.co | sh`,
  not the Classic `pip install tinybird-cli`) and runs
  `tb --cloud --host "$TINYBIRD_HOST" --token "$TINYBIRD_TOKEN" deploy` against
  `lib/tinybird/` (a Forward project: `tinybird.config.json` + `datasources/*.datasource`
  + `endpoints/*.pipe`). The deploy is **best-effort**: on failure it prints a
  loud warning and exits 0 so the app still boots, and only writes the
  `state` sentinel on success.

### 2.5 Upstash

- QStash: token + current/next signing keys.
- Redis: REST URL + token. The `_LOCKER_` pair may reuse the same DB/token.

### 2.6 Neon

- `POSTGRES_PRISMA_URL` = **pooled** connection string, `?sslmode=require`.
- `POSTGRES_PRISMA_URL_NON_POOLING` = **direct** connection string, `?sslmode=require`.

---

## 3. Configure `.env`

```sh
cp .env.docker.example .env
```

Fill every line marked `✎`. Two of them — `INTERNAL_API_KEY` and
`REVALIDATE_TOKEN` — you generate yourself:

```sh
openssl rand -hex 32   # -> INTERNAL_API_KEY
openssl rand -hex 32   # -> REVALIDATE_TOKEN
```

Paste each into `.env` **and** into the Trigger.dev dashboard (§8.2). They must
match on both sides or rendering callbacks return 401.

`NEXTAUTH_SECRET`, `NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY`, and
`NEXT_PRIVATE_VERIFICATION_SECRET` are generated automatically by `secrets-init`
on first boot — leave them blank.

---

## 8.1 Full env var reference

See `.env.docker.example`; every required variable is listed there with a
placeholder and inline comment.

## 8.2 Trigger.dev dashboard env (DO NOT SKIP)

The Trigger.dev **Cloud worker** runs your render tasks in Trigger's
infrastructure, not in this Compose stack. It therefore needs its **own** copy
of the environment, set in the Trigger.dev dashboard (Project → Environment
Variables). This is the #1 reason rendering "mysteriously" fails.

Set these in the dashboard (use the **pooled** Neon URL so the worker doesn't
exhaust direct connections):

```
POSTGRES_PRISMA_URL               # Neon POOLED
POSTGRES_PRISMA_URL_NON_POOLING   # Neon DIRECT
NEXT_PUBLIC_UPLOAD_TRANSPORT=s3
NEXT_PRIVATE_UPLOAD_ENDPOINT
NEXT_PRIVATE_UPLOAD_REGION=auto
NEXT_PRIVATE_UPLOAD_BUCKET
NEXT_PRIVATE_ARCHIVE_BUCKET
NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID
NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY
NEXT_PUBLIC_BASE_URL
NEXTAUTH_URL
INTERNAL_API_KEY                  # SAME value as in .env
REVALIDATE_TOKEN                  # SAME value as in .env
```

The worker must be able to reach the **same** managed Neon Postgres as the app.
Pointing it at a different (e.g. local) database makes rendering silently fail.

---

## 11. Boot & verify

```sh
# Build images (first time, or whenever NEXT_PUBLIC_* change — they are baked
# into the client bundle at build time).
docker compose build

# Boot. First run is slow: Trigger remote build + Tinybird Forward deploy. Later boots
# are fast (sentinels in the `state` volume short-circuit them).
docker compose up -d

# Watch bootstrap progress.
docker compose logs -f secrets-init migrate provision-tinybird provision-trigger

# App health.
docker compose ps
curl -fsS http://localhost:3000/api/health   # {"status":"ok",...}
```

Then, behind your HTTPS proxy:

1. Open the app, request a magic link (Resend email).
2. Create a team, upload a PDF.
3. Confirm the page-by-page viewer renders (Trigger.dev task) and a view is
   recorded (Tinybird).

### Changing `NEXT_PUBLIC_*`

These are inlined into the client bundle at build time. After changing any of
them in `.env`, rebuild — a restart alone is not enough:

```sh
docker compose build app && docker compose up -d app
```

---

## 10. Public access via Cloudflare Tunnel (bundled)

The stack ships a `cloudflared` service that publishes `app` at your public
hostname over HTTPS **without exposing a host port** — the tunnel reaches the
app over the Compose network as `http://app:3000`.

One-time setup (on any machine with `cloudflared` logged in to your account, or
via the Cloudflare Zero Trust dashboard):

```sh
cloudflared tunnel login
cloudflared tunnel create papermark
cloudflared tunnel route dns papermark docs.example.com   # your hostname
cloudflared tunnel token papermark                        # copy the token
```

Then:

1. Put the token in `.env` as `TUNNEL_TOKEN=...`.
2. In **Zero Trust -> Networks -> Tunnels -> papermark -> Public Hostnames**, add
   your hostname and set the **Service** to `http://app:3000`. Token-based
   connectors read their ingress from the Cloudflare edge, not a local config
   file, so this dashboard step is what actually routes traffic to the app.
3. Bring up the stack — `cloudflared` waits for `app` to pass its healthcheck,
   then registers, so there is no boot-time 502 race:

   ```sh
   docker compose up -d
   docker compose logs -f cloudflared   # expect 4 registered edge connections
   ```

With the tunnel handling ingress, the `ports: ["3000:3000"]` mapping on `app`
is optional — keep it only if you also want to reach the app on `localhost`.

---

## 9. Troubleshooting

- **Rendering does nothing / 401 in Trigger logs.** The dashboard env (§8.2) is
  missing/wrong, or `INTERNAL_API_KEY` / `REVALIDATE_TOKEN` differ between
  `.env` and the dashboard. They must match exactly.
- **Rendering silently fails, no error.** The Trigger worker can't reach the
  same Neon DB, or is pointed at a different database. Use the pooled URL in the
  dashboard.
- **Uploads/downloads fail on R2.** Region must be `auto`; both buckets must
  exist and be private; `NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST` must stay unset
  (presigned GET path).
- **Analytics empty / events rejected.** Wrong Tinybird token or region. Set
  `TINYBIRD_HOST` to match your workspace region; the client defaults to
  `api.tinybird.co`.
- **First signup fails.** `createUser` awaits a QStash publish; bad QStash creds
  break the first signup. Verify `QSTASH_TOKEN` + signing keys.
- **Login works but session drops.** Secure cookies need HTTPS. Ensure your
  proxy forwards `X-Forwarded-Proto: https` and the correct `Host`. (The bundled
  `cloudflared` tunnel does this for you.)
- **Public URL returns Cloudflare error 1033 / "no ingress".** The tunnel
  connected but has no public-hostname -> `http://app:3000` mapping. Add it in the
  Zero Trust dashboard (§10 step 2). `cloudflared tunnel info <name>` should show
  active connections.
- **`cloudflared` container crash-loops.** `TUNNEL_TOKEN` is blank or wrong in
  `.env`. Re-copy it with `cloudflared tunnel token <name>`.
- **Re-run a provision step.** Delete its sentinel from the `state` volume:
  `docker compose run --rm provision-tinybird sh -c 'rm -f /state/tinybird.done'`
  then bring the stack up again (same pattern for `/state/trigger.done`).
- **First boot is slow.** Expected — Trigger remote build + `tb --cloud deploy`. `migrate`
  runs every boot but is idempotent.
