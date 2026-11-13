# PEA backend

FastAPI + PostgreSQL 16. Sign-in is Google only: a person can sign in when their Google Workspace domain
belongs to an organization (`organization_domains`, verified) and an Admin has registered them
(active `organization_memberships`).

## First-time setup

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running) and [uv](https://docs.astral.sh/uv/).

```powershell
cd pea_masters_backend
copy .env.example .env          # then fill in the Google client ID/secret and SESSION_SECRET
docker compose up -d --wait     # PostgreSQL on 127.0.0.1:5434 (creates the pea and pea_test databases)
uv sync                         # Python 3.13 + dependencies into .venv
uv run alembic upgrade head     # create the tables
uv run python -m scripts.seed --email name.surname@iliauni.edu.ge --name "Name Surname"
```

The seed adds Ilia State University, its verified domain `iliauni.edu.ge`, and you as Admin + Researcher
(`member`). Developers add `--root`.

To let someone else sign in, register them (and, while the Google app is in *Testing*, also add their email under
Google Auth Platform → Audience → Test users):

```powershell
uv run python -m scripts.seed --email classmate@iliauni.edu.ge --name "Name Surname" --role member
```

`--role` is `admin` (default), `coordinator` or `member` (Researcher); `--root` also makes them Root.
`--self-signup` lets anyone in the domain sign in as a Researcher (development only).

## Managing people

After the first Admin exists, everything else happens in the app: **Administration → People**
(http://localhost:5173/admin/people). Admins add departments, register people, set roles and deactivate accounts.
The structure is organization → faculties → departments (Structure tab). Each department has at most one head
(Coordinator), who registers, renames, deactivates and reactivates the Researchers of that department.

Names (`app/names.py`): registering guesses the name from `name.surname.N@` addresses; each sign-in applies the
official name from Google, unless someone corrected it by hand (`users.name_source` = `manual`).

Profiles (`app/profiles.py`): each person edits their biography (English and Georgian, cleaned of anything unsafe by
`app/richtext.py`) and photo on **My profile → General information**. Photos are checked, cropped to 512×512 and
saved as JPEG in the `storage/` folder (`STORAGE_DIR`, ignored by git); the database keeps only their details.

Permission rules live in `app/authz.py` (one table of which role may do what); every refusal and change is
written to the audit log.

## Every day

```powershell
docker compose up -d                                  # database (if Docker Desktop restarted)
uv run fastapi dev app/main.py                        # API on http://127.0.0.1:8000, reloads on save
cd ../pea_masters_frontend; bun run dev               # app on http://localhost:5173, proxies /api to the API
```

Open http://localhost:5173/login. Use `localhost` (not 127.0.0.1) in the browser: it must match the redirect URI
registered in Google Cloud. While the Google app is in *Testing*, only accounts on its test-user list can sign in.

API docs: http://localhost:5173/api/docs

## Tests and lint

```powershell
uv run pytest      # API tests in tests/api, on the pea_test database; Google is replaced by fake verified claims
uv run ruff check .
```

Browser tests (end-to-end) drive the real app in Chromium against a throwaway `pea_e2e` database, on their own
ports (API 8011, app 5180), so they never touch your data. First time: `uv run playwright install chromium`.

```powershell
uv run pytest tests/e2e                    # headless, about 25 seconds
uv run pytest tests/e2e --headed --slowmo 400   # watch it click through the app
```

They cover: an Admin adds a faculty and a department and registers someone → the person appears as Invited →
their first Google sign-in makes them Active → they're made head of the department, see only its people, and
register, deactivate and reactivate a Researcher → deactivation signs the head out. Also: Settings shows Google
sign-in instead of a password. Screenshots of each step land in `tests/e2e/screenshots/`. Google's own sign-in page can't be automated, so the
tests hand verified Google claims to the same code the real callback uses.

## Sign-in flow

1. The login page sends the browser to `GET /api/v1/auth/google/login?email=…`. Emails from unknown domains are
   refused before leaving the site; others go to Google with the account pre-selected.
2. Google returns to `GET /api/v1/auth/google/callback`. Authlib checks state, nonce, PKCE and the ID token signature.
3. `complete_login` (app/auth/google.py) requires `email_verified`, an `hd` claim that is a verified organization
   domain, a registered user (matched by Google's `sub` after the first sign-in) and an active membership.
4. A random session token goes into the httpOnly `pea_session` cookie; only its SHA-256 is stored in `sessions`.
   Every attempt, allowed or denied, is written to the hash-chained `audit_log`.
5. The app calls `GET /api/v1/auth/me` for the user and their roles; `POST /api/v1/auth/logout` revokes the session.

Refusals come back as `/login?error=<code>`; the login page shows a message for each code.

## Notes

- Use `127.0.0.1`, not `localhost`, in `DATABASE_URL`: on Windows `localhost` tries IPv6 first and the
  connection to Docker stalls.
- Port 5434 is used because this machine may already run PostgreSQL on 5432/5433.
- Tables come from SQL migrations in `migrations/sql`, copied from the full PEA schema. `app/models.py` maps them.
