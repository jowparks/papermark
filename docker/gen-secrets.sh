#!/bin/sh
# gen-secrets.sh — generate the purely-internal secret trio once into
# /secrets/app.env. Idempotent: no-op if the file already exists.
#
# NOTE (decision D2): INTERNAL_API_KEY and REVALIDATE_TOKEN are NOT generated
# here. They must be operator-supplied (in .env AND the Trigger.dev dashboard)
# so the cloud worker's callbacks authenticate. Random in-container values
# could never be mirrored into the dashboard.
set -eu

SECRETS_FILE="/secrets/app.env"

if [ -f "$SECRETS_FILE" ]; then
  echo "gen-secrets: $SECRETS_FILE already exists, leaving it untouched."
  exit 0
fi

mkdir -p "$(dirname "$SECRETS_FILE")"

echo "gen-secrets: generating internal secrets into $SECRETS_FILE"
{
  echo "NEXTAUTH_SECRET=$(openssl rand -hex 32)"
  echo "NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY=$(openssl rand -hex 32)"
  echo "NEXT_PRIVATE_VERIFICATION_SECRET=$(openssl rand -hex 32)"
} > "$SECRETS_FILE"

echo "gen-secrets: done."
