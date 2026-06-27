#!/bin/sh
# migrate-entrypoint.sh — apply the Prisma schema to managed Neon Postgres.
# Runs every boot; `migrate deploy` is idempotent (already-applied migrations
# are skipped). Falls back to `db push` only if no migration files exist.
#
# Prisma reads POSTGRES_PRISMA_URL_NON_POOLING (directUrl) for migrations.
set -eu

echo "migrate: running prisma migrate deploy..."
if npx prisma migrate deploy; then
  echo "migrate: migrate deploy succeeded."
  exit 0
fi

echo "migrate: migrate deploy failed — falling back to prisma db push." >&2
npx prisma db push --skip-generate
echo "migrate: db push succeeded."
