#!/bin/bash
# Nightly Postgres backup, keeps the last 7 days in ~/backups.
# Install:  crontab -e   →   0 2 * * * /home/ubuntu/smart-city-backend/deploy/backup.sh >> /home/ubuntu/backups/backup.log 2>&1
set -euo pipefail
BACKUP_DIR="$HOME/backups"
mkdir -p "$BACKUP_DIR"
cd "$(dirname "$0")"
FILE="$BACKUP_DIR/smartcity-$(date +%F-%H%M).dump"
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U smartcity -d smartcity --format=custom > "$FILE"
find "$BACKUP_DIR" -name 'smartcity-*.dump' -mtime +7 -delete
echo "$(date '+%F %T') backup written: $FILE ($(du -h "$FILE" | cut -f1))"
