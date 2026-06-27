#!/bin/sh
# app-entrypoint.sh — load generated internal secrets, then start Next.js.
set -a
[ -f /secrets/app.env ] && . /secrets/app.env
set +a
exec node server.js
