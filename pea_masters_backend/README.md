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
`app/richtext.py`) and photo in the General information part of **My profile**. Photos are checked, cropped to 512×512 and
saved as JPEG in the `storage/` folder (`STORAGE_DIR`, ignored by git); the database keeps only their details.
Each affiliation in `GET /api/v1/me/profile` also names the person's `coordinator` (their head of department, or a
Coordinator assigned to them personally), whom the evaluation form's "Contact coordinator" writes to by email.

Web of Science (`app/wos.py`): `GET /api/v1/wos/lookup?doi=…` checks an article in Web of Science Core Collection
through Clarivate's Starter API (title, journal, year, times cited, authors, and whether the signed-in person is one of
them). Set `CLARIVATE_API_KEY` in `.env`; without it the check is switched off. Answers are cached in `wos_lookups`
(7 days when found, 1 day when not), so each DOI costs at most one request of the 20,000 a day. API tests replace
Clarivate, and browser tests run a fake one (`tests/e2e/fake_clarivate.py`), so tests never use the quota.

Related endpoints:
- `PUT /api/v1/me/profile/identifiers`: ORCID iD, ResearcherID and Scopus Author ID, checked and stored on the
  profile (`app/identifiers.py`); My profile → Research identifiers.
- `GET /api/v1/wos/me/documents?from_year=&to_year=`: the person's Web of Science documents by those identifiers,
  with document count, citations and an h-index PEA calculates (cached a day in `wos_author_searches`). Used by the
  evaluation form ("Missing from your form") and the CV builder (import, metrics).
- `GET /api/v1/crossref/lookup?doi=` (`app/crossref.py`): whether a DOI is registered and what it is, for articles not
  in Web of Science; `GET /api/v1/wos/journal?issn=`: whether the journal is in Web of Science's journal list. Both
  cached in `external_lookups` (`app/lookups.py`). `CROSSREF_MAILTO` (optional) is a project address, never a person's.
- `GET /api/v1/orgs/{org}/research-output?from_year=&to_year=&unit_id=` (`app/research_output.py`): Web of Science
  output per person and year for Admins (whole organization, a faculty or a department) and heads of department
  (their department); People → Research output.

ORCID (`app/orcid.py`, free Public API): **Connect ORCID iD** (My profile → Research identifiers) sends the person to
ORCID to sign in; ORCID returns to `/api/v1/orcid/callback`, PEA checks the one-time state and stores the iD as verified
(`profiles.orcid_verified_at`; changing the iD by hand drops it). `GET /api/v1/orcid/me/works` lists the record's public
works for the CV builder's **Import from ORCID**. Settings: `ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET`, `ORCID_BASE_URL`
(`https://sandbox.orcid.org` for testing, `https://orcid.org` for real use) and `ORCID_REDIRECT_URI`.

ORCID only accepts `https` redirect URIs, never `localhost`. In development the registered redirect URI is a small
forwarding page on GitHub Pages (`https://<user>.github.io/pea-orcid/callback/`) that sends the browser on to
`http://localhost:5173/api/v1/orcid/callback`. Once PEA has its own `https` address, register
`https://<pea-address>/api/v1/orcid/callback` and leave `ORCID_REDIRECT_URI` empty. ORCID Public API credentials are
personal to whoever registers them and can't be transferred.

Profile sections (`app/profile_entries.py`): qualification entries (education, employment, languages, awards, video
lectures, ...) are stored in `profile_entries`, with supporting documents (PDF, JPG or PNG up to 10 MB, recognised by
their content) attached through `profile_entry_files`. The profile and the CV are the person's own and aren't
reviewed: a saved entry is on the profile straight away. Only the evaluation form is reviewed by the head of department.
Documents (`files.purpose = 'document'`) can be opened only by their owner, Admins of their organization and their head
of department; photos stay visible inside the organization. Research and
Teaching interests are kept in `profiles.research` and `profiles.teaching`. Programmes and supervised students will come
from Argus, which isn't connected yet.

CV builder (`app/cv.py`): each person's CV (headline, research statement, links, publications, talks, layout,
visibility) is one document in `cvs`, saved with the page's Save button or Ctrl+S (`GET`/`PUT /api/v1/me/cv`) and
checked against its shape before it's stored. Leaving the page with unsaved changes asks first. Qualifications, research and teaching on the CV come from the profile, not from this document.
Making a CV public or private is recorded in the audit log; ordinary saves aren't.

Evaluations (`app/evaluations.py`): Admins set up evaluation periods (name, opening day, deadline, which publication
years count) under People → Evaluation periods; deadlines are whole days, Tbilisi time. Forms have parts → items →
points and limits; the ISU self-assessment is built in (`app/evaluation_forms/isu_self_assessment.json`) and can only
be viewed and copied. Coordinators make their own forms under Administration → Evaluation forms, usually as a copy of
the ISU form (`evaluation_forms`); a form can be seen and changed by the person who made it and by the organization's
Admins, and two of one person's forms can't share a name.

Sending and filling in (`app/sent_evaluations.py`): under Administration → Evaluations a coordinator picks a period and
sends a form to their researchers (Admins: anyone in the organization). Each researcher gets one evaluation per period
(`evaluations`), holding a copy of the form as it was sent; until they add an entry it can be replaced by another form
or withdrawn. While the period is open the researcher adds entries (`evaluation_entries`, never deleted, only hidden)
with evidence uploaded through `POST /api/v1/me/documents` (`evaluation_entry_files`), then submits. Until the deadline
they can reopen the form ("Update submission"), change it and resubmit, or discard the changes; the coordinator keeps
seeing the last submission (`evaluations.submission`).

Reviewing (`app/evaluation_reviews.py`): from Evaluations → Review, the coordinator (or an Admin; never the person
themselves) approves or rejects each submitted entry (rejecting needs a comment the researcher sees), then approves the
whole form or returns it with a comment. Approving needs a decision on every entry, works out the final score from the
approved entries within the form's limits (`evaluations.final_score`), and locks the form for good. A returned form is
fixed and resubmitted while the period is open; entries the researcher didn't change keep their decisions. The
reviewer sees what was submitted even while the researcher changes it, and can have the server check an entry's DOI in
Web of Science again (`GET …/evaluations/{id}/entries/{entry}/wos`, against the researcher's name).
The Administration pages (People, Evaluation forms) open only for Admins and Coordinators; anyone else is sent to the
dashboard, and the API refuses them anyway.

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

## On the server

See [DEPLOY.md](../DEPLOY.md): Docker Compose (`deploy/`) runs the database, this API (`Dockerfile`) and Caddy, which
serves the app over https.

## Notes

- Use `127.0.0.1`, not `localhost`, in `DATABASE_URL`: on Windows `localhost` tries IPv6 first and the
  connection to Docker stalls.
- Port 5434 is used because this machine may already run PostgreSQL on 5432/5433.
- Tables come from SQL migrations in `migrations/sql`, copied from the full PEA schema. `app/models.py` maps them.
