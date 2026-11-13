# PEA – Personnel Evaluation & Academic profile

Portal for Ilia State University staff: researcher profiles, evaluation forms and their review.

| Folder | What it is |
|---|---|
| `pea_masters_frontend/` | The web app: React + Vite, run with Bun |
| `pea_masters_backend/` | The API: Python (FastAPI) + PostgreSQL in Docker, run with uv |

People sign in with their university Google account (no passwords). Only people who have been registered can
sign in.

| Role | Who | What they do |
|---|---|---|
| **Root** | The application's developers | Everything, in every organization |
| **Admin** | The organization's responsible person | Manages people, roles, faculties and departments of the whole organization; Admins and Root grant the Admin role |
| **Coordinator** | Head of a department | Registers the Researchers of their department, corrects their names, deactivates and reactivates them |
| **Researcher** | Academic staff (`member` in the database) | Keeps their profile and submits evaluations |

Structure: organization → **faculties** (schools, e.g. *School of Business, Technology and Education*) →
**departments** (programs, e.g. *Computer Science*). Each Researcher belongs to a department; each department has one
head (Coordinator).

This page lists every command the project uses, what it does and when to run it. All commands are for
**PowerShell on Windows**. Backend details are in [pea_masters_backend/README.md](pea_masters_backend/README.md).

---

## Contents

1. [Install the tools (once per computer)](#1-install-the-tools-once-per-computer)
2. [Get the code](#2-get-the-code)
3. [First-time setup](#3-first-time-setup)
4. [Run the app (every day)](#4-run-the-app-every-day)
5. [Register people](#5-register-people)
6. [Database](#6-database)
7. [Tests and code checks](#7-tests-and-code-checks)
8. [Git: branches, commits and pull requests](#8-git-branches-commits-and-pull-requests)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Install the tools (once per computer)

```powershell
winget install Docker.DockerDesktop
winget install astral-sh.uv
winget install Oven-sh.Bun
```

| Tool | What it's for |
|---|---|
| **Docker Desktop** | Runs the PostgreSQL database in a container. Restart the computer after installing, then open Docker Desktop. It must be running whenever you work on the backend. |
| **uv** | Installs Python 3.13 and the backend's packages, and runs backend commands (`uv run …`). |
| **Bun** | Installs the frontend's packages and runs the web app. |

You also need **Git**. After installing, close and reopen your terminal (and VS Code) so it finds the new tools.

Optional: in Docker Desktop → **Settings → General**, turn on **Start Docker Desktop when you sign in**.

---

## 2. Get the code

```powershell
git clone https://github.com/Gudadze2000/pea_masters.git
cd pea_masters
git switch backup_test_branch
```

| Command | What it does |
|---|---|
| `git clone <url>` | Downloads the repository to your computer (only the first time). |
| `git switch <branch>` | Moves to an existing branch. `backup_test_branch` is where finished features are collected. |

---

## 3. First-time setup

### Backend

```powershell
cd pea_masters_backend
copy .env.example .env
```

`copy .env.example .env` creates your private settings file. Open `.env` and fill in:

| Setting | Where it comes from |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Google Auth Platform → Clients. Ask the project owner to send them **privately**. |
| `SESSION_SECRET` | Generate your own with the command below and paste the result. |

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```
Prints a long random string, suitable as a secret.

> `.env` holds secrets. Git ignores it. Never commit it or paste its values into chats, issues or screenshots.

Then set up the database and the Python environment:

```powershell
docker compose up -d --wait
uv sync
uv run alembic upgrade head
uv run python -m scripts.seed --email your.name@iliauni.edu.ge --name "Your Name"
```

| Command | What it does |
|---|---|
| `docker compose up -d --wait` | Starts PostgreSQL 16 in Docker on `127.0.0.1:5434` and waits until it's ready. The first start also creates the `pea_test` database used by tests. |
| `uv sync` | Installs Python 3.13 and all backend packages into `.venv`. Run again after pulling changes to `pyproject.toml` / `uv.lock`. |
| `uv run alembic upgrade head` | Creates or updates the database tables to the latest version. |
| `uv run python -m scripts.seed …` | Adds Ilia State University, its verified domain `iliauni.edu.ge`, and registers you as an **Admin**. See [Register people](#5-register-people). |

### Frontend

```powershell
cd ..\pea_masters_frontend
bun install
```

`bun install` downloads the frontend's packages into `node_modules`. Run it again after pulling changes to `package.json`.

### Google Cloud (project owner, once)

While the Google app is in **Testing**, only accounts on its test-user list can sign in. Add each person's
`@iliauni.edu.ge` address under **Google Auth Platform → Audience → Test users**.

---

## 4. Run the app (every day)

Open Docker Desktop, then use **two terminals** and leave both running.

**Terminal 1 – backend**

```powershell
cd C:\Projects\pea_masters\pea_masters_backend
docker compose up -d
uv run alembic upgrade head
uv run fastapi dev app/main.py
```

| Command | What it does |
|---|---|
| `docker compose up -d` | Starts the database if it isn't running (safe to run when it already is). |
| `uv run alembic upgrade head` | Applies any new database changes from code you pulled. Does nothing if you're up to date. |
| `uv run fastapi dev app/main.py` | Runs the API on `http://127.0.0.1:8000`. Restarts by itself when you save a Python file. |

**Terminal 2 – frontend**

```powershell
cd C:\Projects\pea_masters\pea_masters_frontend
bun run dev
```

`bun run dev` runs the web app on `http://localhost:5173`. It reloads when you save a file and forwards `/api`
requests to the backend.

**Open** http://localhost:5173 and click **Continue with Google**.

- Use `localhost`, not `127.0.0.1`: Google only accepts the exact address registered with it.
- API documentation (every endpoint, try them out): http://localhost:5173/api/docs
- Stop either server with `Ctrl+C` in its terminal. Your data stays in the database.

Other frontend commands:

| Command | What it does |
|---|---|
| `bun run build` | Checks TypeScript and builds the production version into `dist/`. A good check before committing. |
| `bun run preview` | Serves the built version locally, to try what `bun run build` produced. |
| `bun run lint` | Code style checks. Currently fails: `eslint.config.js` was removed in the folder restructure and needs restoring. |

---

## 5. Register people

After the first Admin exists, the normal way is the app: **Administration → People** (http://localhost:5173/admin/people).

1. **Structure** tab → **Add faculty** for each faculty or school, then **Add department** for each department in it.
   Below that, **Add position** for each academic position (Professor, Associate Professor, …).
2. **People** tab → **Add person**: email, name, department, academic position and roles.
3. To make someone head of a department, edit them, tick **Coordinator** and choose the department under
   **Head of department** (one head per department).
4. Heads of department then open **People** themselves and use **Add researcher** to register their Researchers.

**Names:** typing an ISU email (`name.surname.N@iliauni.edu.ge`) fills in the name. At the person's first sign-in,
it's replaced by their official name from ISU's Google directory, which keeps it correct from then on. If an Admin or
head corrects a name by hand, that correction is kept and Google never overwrites it.

From the terminal (in `pea_masters_backend`), mainly for the first Admin:

```powershell
uv run python -m scripts.seed --email name.surname@iliauni.edu.ge --name "Name Surname"
uv run python -m scripts.seed --email classmate@iliauni.edu.ge --name "Name Surname" --role member
uv run python -m scripts.seed --email dev.name@iliauni.edu.ge --name "Dev Name" --root
uv run python -m scripts.seed --self-signup
uv run python -m scripts.seed --no-self-signup
uv run python -m scripts.seed --help
```

| Option | What it does |
|---|---|
| `--email`, `--name` | The person's university Google email and display name. The email must be in `iliauni.edu.ge`. |
| `--role admin\|coordinator\|member` | Their role (default `admin`; `member` = Researcher). Everyone also gets `member`. Heads of department are easier to set up in the app, where you choose their department. |
| `--root` | Also makes them **Root** (a developer with access to every organization). |
| `--self-signup` / `--no-self-signup` | Lets anyone in the domain sign in and become a Researcher without being registered. **Development only.** |
| `--help` | Lists all options. |

The command must be run **inside `pea_masters_backend`**, and running it twice does no harm. Each person registers
themselves in their **own** local database. Databases aren't shared between computers until the app is on a server.

---

## 6. Database

Run these in `pea_masters_backend`.

| Command | What it does |
|---|---|
| `docker compose up -d` | Starts the database container in the background. |
| `docker compose up -d --wait` | Same, and waits until it accepts connections. |
| `docker compose stop` | Stops the database; data is kept. |
| `docker compose down` | Removes the container; data is kept (it lives in a Docker volume). |
| `docker compose down -v` | **Deletes all local data**: container and volume. Afterwards run `docker compose up -d --wait`, `uv run alembic upgrade head` and the seed command again. |
| `docker compose ps` | Shows whether the database is running and healthy. |
| `docker compose exec db psql -U pea -d pea` | Opens a SQL prompt in the development database. Type `\dt` to list tables, `\q` to quit. |
| `uv run alembic upgrade head` | Applies all database changes (migrations) that haven't run yet. |
| `uv run alembic current` | Shows which migration the database is at (e.g. `0002 (head)`). |
| `uv run alembic downgrade -1` | Undoes the most recent migration. Use with care: it drops those tables and their data. |

Connection details for tools like DBeaver: host `127.0.0.1`, port `5434`, database `pea`, user `pea`, password `pea`
(local development only).

---

## 7. Tests and code checks

Run these in `pea_masters_backend` with Docker Desktop running. Tests use their own databases and never touch your data.

```powershell
uv run pytest
uv run pytest tests/e2e
```

| Command | What it does |
|---|---|
| `uv run pytest` | **API tests** (`tests/api`): sign-in, permissions, departments, people. About 15 seconds; ends with e.g. `34 passed`. |
| `uv run pytest tests/e2e` | **Browser tests** (`tests/e2e`): open the real app in a hidden Chrome and click through the People page. About 25 seconds. |
| `uv run pytest tests/e2e --headed --slowmo 400` | Same, in a visible browser window, slowed down so you can watch. |
| `uv run playwright install chromium` | Downloads the browser for the browser tests. Once per computer. |
| `uv run pytest -v` | Lists every test by name with its result. |
| `uv run pytest -x` | Stops at the first failure. |
| `uv run pytest -k people` | Runs only tests whose name contains "people". |
| `uv run pytest tests/api/test_people.py` | Runs one test file. |
| `uv run ruff check .` | Checks Python code style and common mistakes. |
| `uv run ruff check . --fix` | Same, and fixes what it can automatically. |
| `bun run build` (in `pea_masters_frontend`) | Type-checks and builds the frontend; errors here mean something is broken. |

Notes:
- Run API tests and browser tests **separately**. `uv run pytest tests` stops and tells you so, because each set
  uses a different database.
- Browser tests use ports 8011 and 5180. If one is busy, close whatever uses it.
- Screenshots of each browser-test step are saved in `pea_masters_backend\tests\e2e\screenshots\`.

Adding packages (in `pea_masters_backend`):

| Command | What it does |
|---|---|
| `uv add <package>` | Adds a Python package the app needs, updating `pyproject.toml` and `uv.lock`. |
| `uv add --dev <package>` | Adds a package only needed for development/tests (e.g. `pytest-playwright`). |

---

## 8. Git: branches, commits and pull requests

Each feature gets its own branch named `feature/<what-it-does>`, made from the up-to-date `backup_test_branch`,
and comes back through a pull request.

**See where you are**

| Command | What it does |
|---|---|
| `git status` | Shows your branch and which files changed, are staged or are new. |
| `git branch` | Lists your local branches; `*` marks the current one. |
| `git branch -r` | Lists branches on GitHub. |
| `git log --oneline -5` | Shows the last 5 commits, one line each. |

**Get the latest changes**

| Command | What it does |
|---|---|
| `git fetch` | Downloads what's new on GitHub without changing your files. |
| `git pull` | Downloads and applies new commits to your current branch. |
| `git switch <branch>` | Moves to an existing branch, e.g. `git switch feature/google-login`. |

**Start a feature**

```powershell
git switch backup_test_branch
git pull
git switch -c feature/<short-name>
```

`git switch -c <name>` creates a new branch from where you are and moves to it.

**Save and share your work**

```powershell
git add -A
git commit -m "Short summary of the change"
git push -u origin feature/<short-name>
```

| Command | What it does |
|---|---|
| `git add -A` | Stages all changes (new, edited, deleted files) for the next commit. `.env` and other ignored files are skipped. |
| `git add <path>` | Stages only that file or folder. |
| `git commit -m "…"` | Saves the staged changes as a commit with that message. |
| `git push -u origin <branch>` | Uploads the branch to GitHub. `-u` links it, so later you can just run `git push`. |
| `git push` | Uploads new commits on a branch that's already linked. |

**Pull request**

After pushing, open the link Git prints (or GitHub → **Pull requests → New**) and choose:
**base:** `backup_test_branch` ← **compare:** your `feature/…` branch. After it's merged on GitHub:

```powershell
git switch backup_test_branch
git pull
```

---

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| `uv`, `bun` or `docker` "is not recognized" | Close and reopen the terminal and VS Code after installing. |
| `No module named 'scripts'` or `No module named 'app'` | Run backend commands **inside `pea_masters_backend`**. |
| Login page says **Server unavailable** | The backend (Terminal 1) isn't running, or Docker Desktop is closed. |
| **Account not registered** after Google | Register the person: People page, or the seed command in [section 5](#5-register-people). |
| Google: **Access blocked / app not verified** | The account isn't on the Google test-user list. |
| Google: **redirect_uri_mismatch** | Open the app at exactly `http://localhost:5173`. |
| Vite started on **5174** instead of 5173 | Something already uses 5173 (often another `bun run dev`). Google sign-in only works on 5173; close the other one. |
| Database connection hangs | Use `127.0.0.1`, not `localhost`, in `DATABASE_URL`: on Windows, `localhost` tries IPv6 first and stalls. |
| `ports are not available` from Docker | Another program uses that port. This project uses 5434 for PostgreSQL to avoid the usual 5432/5433. |
| No departments in the person form | Add a faculty and its departments first in the **Structure** tab of the People page. |
| A department shows under "Departments not in a faculty" | It was made before faculties existed. Edit it in the **Structure** tab and choose its faculty. |

Find what's using a port (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen | Select-Object LocalPort, OwningProcess
Get-Process -Id <OwningProcess>
```

The first command shows which process listens on the port. The second shows its name, so you can close it
(or stop it with `Stop-Process -Id <id>` if you're sure it's yours).
