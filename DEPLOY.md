# Running PEA on the server

PEA runs on the university's Ubuntu server as three Docker containers, defined in `deploy/compose.yml`:

| Container | What it does |
|-----------|--------------|
| `web` (Caddy) | Serves the app and passes `/api` to the API. Gets and renews the Let's Encrypt certificate, and redirects `http://` to `https://`. The only thing reachable from outside (ports 80 and 443). |
| `api` | The FastAPI backend. Brings the database up to date (migrations) every time it starts. |
| `db` | PostgreSQL 16. Not reachable from outside the server. |

Data lives in Docker volumes: `pea_pgdata` (database), `pea_storage` (uploaded photos and documents) and `pea_caddy_data`
(the certificate). Rebuilding or restarting containers keeps them.

The server reaches the internet through the university firewall. IT has opened outbound HTTPS to Google, Clarivate,
Crossref and ORCID, and Docker Hub, PyPI, npm and GitHub work too. `ghcr.io` is blocked, so the images avoid it.

## Before the first deploy

1. **Google sign-in.** Google Cloud Console → Google Auth Platform → Clients → the PEA client:
   - Authorized redirect URIs: add `https://pea.iliauni.edu.ge/api/v1/auth/google/callback`
   - Authorized JavaScript origins: add `https://pea.iliauni.edu.ge`

   Keep the `localhost` entries for development. While the app is in *Testing*, only its test users can sign in.
2. **ORCID.** In ORCID's Developer tools, add `https://pea.iliauni.edu.ge/api/v1/orcid/callback` as a redirect URI.
   The GitHub Pages forwarder is only for development.

## One-time server setup

Connect to the VPN, then `ssh pea-server`:

```bash
git clone https://github.com/Gudadze2000/pea_masters.git ~/pea_masters
cd ~/pea_masters
git switch backup_test_branch      # the branch the server runs; deploy.sh pulls this branch
sudo ./deploy/install.sh           # Docker, firewall, automatic security updates, backups folder
exit                               # sign out and back in, so you can use docker without sudo
```

`install.sh` allows SSH (on the port sshd uses) before switching the firewall on, so it can't lock you out.

## First deploy

```bash
cd ~/pea_masters/deploy
cp .env.example .env
chmod 600 .env
nano .env                          # fill it in (below)
./deploy.sh                        # builds and starts everything; the first build takes a few minutes
docker compose exec api python -m scripts.seed --email name.surname@iliauni.edu.ge --name "Name Surname"
```

In `.env`:
- Generate `DB_PASSWORD` with `openssl rand -hex 32`, and `SESSION_SECRET` with `openssl rand -base64 48`.
- Copy the Google, Clarivate and ORCID values from your development `pea_masters_backend/.env`.
- Leave `ORCID_REDIRECT_URI` empty.

**Never** commit `.env` or paste it anywhere: git ignores it, and only you can read it on the server.

PEA refuses to start with development values (a short secret, the development database password, missing Google
settings). `docker compose logs api` says what's wrong.

The seed command registers the first Admin. Everyone else is added in the app (People).

Then open https://pea.iliauni.edu.ge from **outside** the university network, e.g. a phone on mobile data:
- The first visit can take a minute while Caddy gets the certificate.
- If it never loads, `docker compose logs web` shows whether Let's Encrypt could reach the server. Send IT that error,
  since they offered to open anything that's blocked from outside.

## Updating the live site

Merge the changes into the branch the server runs, then:

```bash
ssh pea-server
~/pea_masters/deploy/deploy.sh
```

`deploy.sh` backs up, pulls the code, rebuilds what changed, restarts and checks the API answers. Downtime is a few
seconds. New migrations run on their own as the API starts.

## Backups

`deploy/backup.sh` saves the database and the uploaded files to `/var/backups/pea` and keeps 14 days. To run it every
night at 03:15, run `crontab -e` and add:

```
15 3 * * * $HOME/pea_masters/deploy/backup.sh >> /var/backups/pea/backup.log 2>&1
```

These copies are on the same disk as the data. They help after a mistake, not after the server is lost, so ask IT
where an off-server copy should go.

To restore a backup (this replaces the current data):

```bash
cd ~/pea_masters/deploy
docker compose stop api web
docker compose exec -T db dropdb -U pea pea
docker compose exec -T db createdb -U pea pea
docker compose exec -T db pg_restore -U pea -d pea --no-owner < /var/backups/pea/pea-YYYY-MM-DD-HHMM.dump
docker compose run --rm -T --no-deps api sh -c 'rm -rf /data/storage/* && tar -C /data -xzf -' \
  < /var/backups/pea/storage-YYYY-MM-DD-HHMM.tar.gz
docker compose up -d --wait
```

## Everyday commands

Run these in `~/pea_masters/deploy`:

```bash
docker compose ps                         # what's running, and whether it's healthy
docker compose logs -f --tail 100 api     # API log (web, db likewise); Ctrl+C to stop following
docker compose restart api                # restart one part
docker compose exec db psql -U pea pea    # the database, for looking around (\q to leave)
```

Logs are capped at 50 MB per container. The containers start again on their own after a reboot.

## Security notes

- Only 80 and 443 are published. The database and the API are reachable only inside Docker's network.
- Docker opens its published ports itself, alongside ufw. Don't publish any other ports in `compose.yml`.
- API responses are never cached (`Cache-Control: no-store`). The app's files are, and their names change with each
  build.
- The API trusts the visitor address Caddy passes on, so the audit log records real addresses. Caddy ignores addresses
  that visitors make up.
