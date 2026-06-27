#!/bin/sh
# provision-tinybird.sh — deploy Tinybird datasources + endpoints to a
# Tinybird *Forward* cloud workspace.
# Idempotent via sentinel /state/tinybird.done (written only on SUCCESS).
# Runs on python:3.12-slim; installs the Forward CLI (NOT the Classic pip CLI),
# then `tb --cloud deploy`.
# TINYBIRD_TOKEN required. TINYBIRD_HOST optional (set for non-default regions,
# e.g. us-east aws -> https://api.us-east.aws.tinybird.co).
# Best-effort: a failed deploy prints a loud warning and exit 0 so `app` still
# boots; the sentinel is NOT written on failure.
set -eu

SENTINEL="/state/tinybird.done"

if [ -f "$SENTINEL" ]; then
  echo "provision-tinybird: $SENTINEL present, skipping deploy."
  exit 0
fi

: "${TINYBIRD_TOKEN:?TINYBIRD_TOKEN is required for tinybird deploy}"

warn_and_skip() {
  echo ""
  echo "############################################################"
  echo "# TINYBIRD NOT PROVISIONED — analytics disabled.           #"
  echo "# The app will still boot. Fix the error above and re-run  #"
  echo "# (delete $SENTINEL is not needed — it was not written).   #"
  echo "############################################################"
  echo ""
  exit 0
}

echo "provision-tinybird: installing Tinybird Forward CLI..."
# slim image has no curl
apt-get update >/dev/null 2>&1 && apt-get install -y curl >/dev/null 2>&1 || {
  echo "provision-tinybird: failed to install curl."
  warn_and_skip
}
curl https://tinybird.co | sh || {
  echo "provision-tinybird: failed to install the Forward CLI."
  warn_and_skip
}
export PATH="$HOME/.local/bin:$PATH"

# The project dir is mounted read-only; `tb deploy` writes build artifacts, so
# copy to a writable location before deploying.
WORKDIR="$(mktemp -d)"
cp -r /work/lib/tinybird/. "$WORKDIR/"
cd "$WORKDIR"

# shellcheck disable=SC2086
HOST_ARG=""
if [ -n "${TINYBIRD_HOST:-}" ]; then
  HOST_ARG="--host $TINYBIRD_HOST"
fi

echo "provision-tinybird: validating deployment (deploy --check)..."
# shellcheck disable=SC2086
if ! tb --cloud $HOST_ARG --token "$TINYBIRD_TOKEN" deploy --check; then
  echo "provision-tinybird: deploy --check failed."
  warn_and_skip
fi

echo "provision-tinybird: deploying to Tinybird Forward cloud..."
# shellcheck disable=SC2086
if ! tb --cloud $HOST_ARG --token "$TINYBIRD_TOKEN" deploy; then
  echo "provision-tinybird: deploy failed."
  warn_and_skip
fi

mkdir -p "$(dirname "$SENTINEL")"
touch "$SENTINEL"
echo "provision-tinybird: done, wrote $SENTINEL."
