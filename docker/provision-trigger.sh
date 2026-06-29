#!/bin/sh
# provision-trigger.sh — deploy Trigger.dev tasks to Trigger.dev Cloud. Remote
# builds (no docker socket). STATELESS one-shot setup step: run it manually (it
# lives behind the `setup` Compose profile, not on every boot) on first setup or
# whenever your tasks change.
#   docker compose --profile setup run --rm provision-trigger
# Trigger.dev Cloud keeps the deployed tasks independently of this server, so a
# plain `docker compose up` (e.g. after moving servers) does NOT re-deploy.
# Needs TRIGGER_ACCESS_TOKEN (tr_pat_...) + TRIGGER_PROJECT_REF (proj_...).
set -eu

: "${TRIGGER_ACCESS_TOKEN:?TRIGGER_ACCESS_TOKEN is required for trigger deploy}"
: "${TRIGGER_PROJECT_REF:?TRIGGER_PROJECT_REF is required for trigger deploy}"

echo "provision-trigger: deploying tasks to Trigger.dev Cloud (project $TRIGGER_PROJECT_REF)..."
npx trigger.dev@4 deploy

echo "provision-trigger: done."
