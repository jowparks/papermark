#!/bin/sh
# provision-trigger.sh — deploy Trigger.dev tasks to Trigger.dev Cloud.
# Idempotent via sentinel /state/trigger.done. Remote builds (no docker socket).
# Needs TRIGGER_ACCESS_TOKEN (tr_pat_...) + TRIGGER_PROJECT_REF (proj_...).
set -eu

SENTINEL="/state/trigger.done"

if [ -f "$SENTINEL" ]; then
  echo "provision-trigger: $SENTINEL present, skipping deploy."
  exit 0
fi

: "${TRIGGER_ACCESS_TOKEN:?TRIGGER_ACCESS_TOKEN is required for trigger deploy}"
: "${TRIGGER_PROJECT_REF:?TRIGGER_PROJECT_REF is required for trigger deploy}"

echo "provision-trigger: deploying tasks to Trigger.dev Cloud (project $TRIGGER_PROJECT_REF)..."
npx trigger.dev@4 deploy

mkdir -p "$(dirname "$SENTINEL")"
touch "$SENTINEL"
echo "provision-trigger: done, wrote $SENTINEL."
