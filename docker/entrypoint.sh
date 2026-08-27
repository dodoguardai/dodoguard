#!/bin/sh
set -e

# Named/bind volumes are often root-owned; ensure app user can write SQLite + reports.
chown -R dodoguard:dodoguard \
  /home/dodoguard/.dodoguard \
  /app/reports \
  /app/user-configs \
  2>/dev/null || true

exec su-exec dodoguard "$@"
