#!/bin/sh
# Container start: apply pending database migrations, then run the API.
# Any other command is run as-is, e.g.:
#   docker compose run --rm api npx -y tsx prisma/seed.ts
set -e

PRISMA_CONFIG=""
[ -f prisma7.config.ts ] && PRISMA_CONFIG="--config prisma7.config.ts"

if [ "$1" = "start" ]; then
  echo "==> Applying database migrations"
  npx prisma migrate deploy $PRISMA_CONFIG
  echo "==> Starting API"
  # Nest outputs dist/src/main.js when config files sit next to src/, otherwise dist/main.js
  if [ -f dist/src/main.js ]; then exec node dist/src/main.js; fi
  exec node dist/main.js
fi

exec "$@"
