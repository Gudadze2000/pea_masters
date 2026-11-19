#!/usr/bin/env bash
# Puts the latest code from GitHub live:   ./deploy/deploy.sh
# Pulls the branch the server is on, rebuilds what changed, and restarts. The API brings the database up to date
# (migrations) as it starts. Takes a backup first.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "deploy/.env is missing: copy deploy/.env.example and fill it in (see DEPLOY.md)" >&2
  exit 1
fi

if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  ./backup.sh
fi

echo "== Code"
git pull --ff-only
git log -1 --format='%h %s (%cr)'

echo "== Build and start"
docker compose build --pull
docker compose up -d --wait --remove-orphans
docker image prune -f >/dev/null

echo "== Check"
docker compose ps
docker compose exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health').read().decode())"
