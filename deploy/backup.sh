#!/bin/sh
# Nightly database backup; keeps 14 days. Cron: 30 2 * * * /opt/presently/deploy/backup.sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_dump -U attendance -Fc attendance > "backups/presently-$(date +%F).dump"
find backups -name 'presently-*.dump' -mtime +14 -delete
