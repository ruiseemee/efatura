#!/bin/sh
set -e
echo "A aplicar migrações da base de dados…"
node dist/migrate.js
if [ -n "$SEED_ADMIN_PASSWORD" ]; then
  node dist/seed.js
fi
exec node dist/server.js
