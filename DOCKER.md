# Papermark Self-Host (Docker Compose)

A single `docker compose up` boots a working Papermark that:

- stores documents in **Cloudflare R2** (S3-compatible, presigned GET, private buckets),
- renders the page-by-page PDF viewer via **Trigger.dev Cloud**,
- records analytics via **Tinybird**,
- supports **email (magic-link) login** via **Resend**,
- uses a managed **Neon** Postgres (no local DB container).

This stack is **stateless** — no named volumes, nothing persisted to local disk.
Every secret lives in `.env`, so you move to a new server by copying `.env` and
running `docker compose up`. A plain `docker compose up` runs:

| service       | what it does                                  | idempotency       |
| ------------- | --------------------------------------------- | ----------------- |
| `migrate`     | `prisma migrate deploy` against Neon          | safe every boot   |
| `app`         | Next.js standalone runtime (`node server.js`) | healthcheck gated |
| `documenso`   | bundled e-signature service (optional, §12)   | —                 |
| `cloudflared` | public HTTPS tunnel to `app` (optional, §10)  | —                 |

`app` starts after `migrate` completes.

External-cloud provisioning (Tinybird datasources/endpoints, Trigger.dev tasks)
is a **one-time setup step**, NOT part of `up` — those clouds keep their own state,
so a server move never re-runs them. They live behind the `setup` profile:

| setup step (run manually)                                    | what it does                                          |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `docker compose --profile setup run --rm provision-tinybird` | `tb --cloud deploy` (Forward) datasources + endpoints |
| `docker compose --profile setup run --rm provision-trigger`  | `trigger.dev@4 deploy` to Trigger.dev Cloud           |

Run both once on first setup (and again whenever you change `lib/tinybird/` or
your Trigger.dev tasks).

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

Fill every line marked `✎`. Several are secrets you generate yourself with
`openssl rand -hex 32`:

```sh
openssl rand -hex 32   # -> INTERNAL_API_KEY   (ALSO paste into Trigger dashboard, §8.2)
openssl rand -hex 32   # -> REVALIDATE_TOKEN   (ALSO paste into Trigger dashboard, §8.2)
openssl rand -hex 32   # -> NEXTAUTH_SECRET
openssl rand -hex 32   # -> NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY
openssl rand -hex 32   # -> NEXT_PRIVATE_VERIFICATION_SECRET
```

`INTERNAL_API_KEY` / `REVALIDATE_TOKEN` must **match** between `.env` and the
Trigger dashboard or rendering callbacks return 401.

The last three (the internal secret trio) sign sessions and encrypt stored data,
so **keep them stable**. Because they live in `.env`, the same `.env` carried to a
new server keeps existing data readable — in particular, changing
`NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY` makes already-saved document passwords
permanently undecryptable.

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
SIGNING_API_KEY                   # only if using embedded signing (§12)
NEXT_PUBLIC_SIGNING_HOST          # only if using embedded signing (§12)
```

The worker must be able to reach the **same** managed Neon Postgres as the app.
Pointing it at a different (e.g. local) database makes rendering silently fail.

`SIGNING_API_KEY` / `NEXT_PUBLIC_SIGNING_HOST` are needed in the dashboard because
the `setup-signing-template` task (which creates the Documenso template) runs on
the Trigger worker, not in this stack. See §12.

---

## 11. Boot & verify

```sh
# Build images (first time, or whenever NEXT_PUBLIC_* change — they are baked
# into the client bundle at build time).
docker compose build

# FIRST-TIME SETUP ONLY: provision the external clouds (slow: Trigger remote build
# + Tinybird Forward deploy). Skip this when moving an already-provisioned stack to
# a new server — the clouds keep their state.
docker compose --profile setup run --rm provision-tinybird
docker compose --profile setup run --rm provision-trigger

# Boot (fast — migrate is idempotent, no provisioning runs here).
docker compose up -d

# Watch progress.
docker compose logs -f migrate app

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
- **Re-run a provision step.** Just run it again — it always redeploys (there are
  no sentinels): `docker compose --profile setup run --rm provision-tinybird`
  (same for `provision-trigger`).
- **First-time provisioning is slow.** Expected — Trigger remote build + `tb --cloud
  deploy`. This runs only on the manual `--profile setup` steps, never on `up`.
  `migrate` runs every boot but is idempotent.

---

## 12. Embedded signing (Documenso) — optional

Papermark's **"Embedded signature flow"** agreements (the DocuSign-style flow:
upload a PDF, place signature/name/date fields, recipient signs inline) are
powered by **[Documenso](https://documenso.com)**, the open-source DocuSign
alternative — Papermark embeds it, it does not sign PDFs itself. This stack runs
a self-hosted Documenso so the whole flow is free.

Skip this whole section if you don't need signing — Papermark runs fine without it.

### 12.1 Why self-host Documenso

Documenso's **embedded authoring** (placing fields without leaving Papermark) is
a paid feature **on Documenso Cloud only** — the paywall is gated behind
`IS_BILLING_ENABLED()`. Self-hosted Documenso runs with billing **off**, so both
embedded authoring and signing work for free.

### 12.2 Architecture

```
Papermark (app:3000) ──API (SIGNING_API_KEY)──▶ Documenso (documenso:3000)
        │                                              │
        └──────────── same cloudflared tunnel ─────────┘
   papermark.<domain>  ──route──▶ app:3000
   sign.<domain>       ──route──▶ documenso:3000
```

One new Compose service:

| service     | what it does                                                   | idempotency |
| ----------- | ------------------------------------------------------------- | ----------- |
| `documenso` | Documenso app; own Neon DB + R2 bucket; migrates itself on boot | —           |

The signing cert is passed inline as base64 (`DOCUMENSO_CERT_P12_BASE64` in
`.env`, via `NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS`) — no cert file or volume,
so it travels with `.env`.

The `documenso` service uses an explicit `environment:` block (NOT `env_file:
[.env]`) because Documenso reuses Papermark's `NEXT_PRIVATE_UPLOAD_*` /
`NEXTAUTH_SECRET` variable **names** with different **values** — sharing `.env`
would feed it Papermark's bucket and secret.

### 12.3 Prerequisites (one-time)

1. **R2 bucket** — create a private bucket named `documenso` (separate from
   Papermark's). Reuses your existing R2 keys + endpoint.
2. **Neon database** — create a **separate** `documenso` database in the *same*
   Neon project (a separate DB, not the same one — Documenso's tables would
   collide with Papermark's). Grab the **pooled** and **direct** URLs.
3. **Cloudflare route** — in Zero Trust → your tunnel → **Published application
   routes**, add `sign.<domain>` → Service `http://documenso:3000` (same tunnel,
   second hostname). Auto-creates the DNS CNAME.

### 12.4 Configure `.env`

Fill the **Embedded signing (Documenso)** block:

- `NEXT_PUBLIC_SIGNING_HOST=https://sign.<domain>` — build-time baked, so
  changing it requires a `docker compose build app`.
- `DOCUMENSO_DATABASE_URL` / `DOCUMENSO_DIRECT_DATABASE_URL` — the new Neon DB.
- `DOCUMENSO_SMTP_FROM_ADDRESS` — on your Resend-verified domain (Documenso
  reuses `RESEND_API_KEY` via Resend's native transport).
- `DOCUMENSO_NEXTAUTH_SECRET`, `DOCUMENSO_ENCRYPTION_KEY`,
  `DOCUMENSO_ENCRYPTION_SECONDARY_KEY` — `openssl rand -base64 32` each.
- `DOCUMENSO_CERT_PASSPHRASE` — `openssl rand -hex 16`.
- `DOCUMENSO_CERT_P12_BASE64` — the self-signed signing cert as a single base64
  line. Generate it once with the passphrase above:
  ```sh
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout k.pem -out c.pem -subj "/CN=Documenso Self-Host"
  openssl pkcs12 -export -legacy -inkey k.pem -in c.pem -passout pass:"$DOCUMENSO_CERT_PASSPHRASE" | base64 | tr -d '\n'
  rm k.pem c.pem
  ```
  Paste the output into `DOCUMENSO_CERT_P12_BASE64=`. (Self-signed is fine for
  self-host: it produces a valid, tamper-evident signature; it just isn't chained
  to a public CA.)
- Leave `SIGNING_API_KEY` **blank for now** — it doesn't exist until Documenso boots.

### 12.5 Boot (two-phase — the key gotcha)

`SIGNING_API_KEY` is minted *inside* Documenso's UI after it's running, so this
is a two-pass setup:

```sh
# Pass 1 — bring up Documenso (rebuild for the baked NEXT_PUBLIC_SIGNING_HOST).
docker compose build
docker compose up -d
docker compose logs -f documenso          # wait for "Listening on port 3000"
```

1. Open `https://sign.<domain>`, create the first Documenso account, verify the
   email (Resend). This account owns the API token.
2. In Documenso → **Settings → API Tokens**, create a token. Copy it.
3. Paste it into `.env` as `SIGNING_API_KEY=...` **and** into the **Trigger.dev
   dashboard** (§8.2) — the `setup-signing-template` task runs on the worker.

```sh
# Pass 2 — restart the app so it picks up SIGNING_API_KEY (runtime var, no rebuild),
# and redeploy the Trigger task env.
docker compose up -d app
```

### 12.6 Enable the feature in Papermark (plan gate)

Papermark gates "Create agreement" behind a Business/Datarooms/trial plan. On a
fresh self-host your team is `free`; bump it directly in Neon:

```sql
-- find your team id
SELECT id, name, plan FROM "Team";
-- then
UPDATE "Team" SET plan = 'business' WHERE id = '<your-team-id>';
```

Then: **Settings → Agreements → Create agreement → Embedded signature flow** →
upload a PDF → place fields → attach the agreement to a share link.

### 12.7 Troubleshooting

- **`SIGNING_API_KEY environment variable is not set`** in app logs — you booted
  the app before minting/pasting the key. Do §12.5 pass 2.
- **"Embedded Authoring is not included in your plan"** from Documenso — you
  pointed `NEXT_PUBLIC_SIGNING_HOST` at Documenso **Cloud**, not your self-host.
  The free path requires the self-hosted instance (billing off).
- **Field placement step fails / blank editor** — `NEXT_PUBLIC_SIGNING_HOST` was
  empty at build time (baked the `app.documenso.com` default). Set it in `.env`
  and `docker compose build app`.
- **`sign.<domain>` returns 502** — `documenso` container isn't up yet.
  `docker compose logs documenso`.
- **Boot log says `⚠️ Certificate not found`** — cosmetic. Documenso's startup
  check only looks at the (unused) file path; the signer reads
  `DOCUMENSO_CERT_P12_BASE64` from the env at sign time. Ignore it.
- **Documenso can't sign / cert error** — regenerate the cert with the commands in
  §12.4, replace `DOCUMENSO_CERT_P12_BASE64` in `.env`, and `docker compose up -d
  documenso`. Ensure the value is a single line (no newlines) and
  `DOCUMENSO_CERT_PASSPHRASE` matches.
- **Documenso upload errors on R2** — the `documenso` bucket doesn't exist, or
  `NEXT_PRIVATE_UPLOAD_FORCE_PATH_STYLE` got unset. Both are required for R2.
