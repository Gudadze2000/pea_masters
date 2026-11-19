#!/usr/bin/env bash
# Copies the database and the uploaded files to /var/backups/pea and keeps the last 14 days.
#   ./deploy/backup.sh          (deploy.sh runs it too; install it in cron as DEPLOY.md shows)
# These copies are on the same server: they help after a mistake, not after the disk dies. Copy them elsewhere too.
set -euo pipefail
cd "$(dirname "$0")"

dest=${BACKUP_DIR:-/var/backups/pea}
keep_days=${BACKUP_KEEP_DAYS:-14}
stamp=$(date +%Y-%m-%d-%H%M)
mkdir -p "$dest"
umask 077 # the backups hold personal data: only this user may read them

echo "== Backup to $dest"
# Written under a temporary name first, so a backup that fails halfway is never mistaken for a good one
docker compose exec -T db pg_dump -U pea -d pea --format=custom > "$dest/.pea-$stamp.dump"
mv "$dest/.pea-$stamp.dump" "$dest/pea-$stamp.dump"
# A one-off container from the API's image reads the files, so this works even while the API is down
docker compose run --rm -T --no-deps api tar -C /data -czf - storage > "$dest/.storage-$stamp.tar.gz"
mv "$dest/.storage-$stamp.tar.gz" "$dest/storage-$stamp.tar.gz"

find "$dest" -maxdepth 1 -type f \( -name 'pea-*.dump' -o -name 'storage-*.tar.gz' \) -mtime "+$keep_days" -delete
ls -lh "$dest" | tail -n 4
