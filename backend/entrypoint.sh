#!/bin/sh
set -e

# Garante o superuser em todo boot (idempotente — "upsert"). Resolve o problema de
# galinha-e-ovo: sem isso, um deploy com pb_data vazio exige criar o superuser
# manualmente pelo terminal antes que o import-worker pare de falhar autenticação
# e o Coolify mate a stack por restart loop.
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  /pb/pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir=/pb/pb_data
fi

exec /pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data \
     --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks
