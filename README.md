Personnel Evaluation and Researcher Profiles

A web app for Ilia State University staff. Researchers keep a profile with their details, photo, publications, professional history, teaching and research activity, and can make it public or private. Visitors who are not signed in can browse public profiles. The app also contains a private personnel-evaluation tool.

Built on the Agent-Native framework (React Router, Vite, Drizzle, PGlite locally).

Features

For signed-in researchers

Home (/): welcome page with links to everything below.
My profile (/profile): first and last name, date of birth, university, position, department, biography, profile photo (JPEG, PNG or WebP, up to 2 MB), a Public/Private switch, and publications. Removed publications can be restored or deleted permanently.
Edit profile content (/profile-sections):
Professional: awards, memberships, employment, education, languages, committees, consultancy, creative work, patents, other activities.
Teaching: teaching interests, modules coordinated, students supervised.
Research: projects, contract researchers, collaborators. Projects can be linked to your publications.
Every entry has From/To dates and a Show/Hide switch. Entries are hidden by default.
Patents and research projects can be shared with other staff. They see them read-only.
Preferences (/preferences): author names, organisation, Scopus / Web of Science / ORCID IDs, search keywords, system language and alert settings. The IDs, language and alert settings are saved but not used yet (see "Not built yet").
Researchers (/profiles): public profiles of other researchers, with photo, university, department and a biography excerpt. Your own profile is not listed.
Evaluations (/evaluations): private personnel evaluations. Score teaching, research and service from 0 to 5, add notes, save as draft or submit. Visible only to the account that wrote them.

For guests (not signed in)

/profiles: the researcher list.
/people?email=...: a public profile with details, photo, shown entries and publications.
/publication?id=...: a single publication.
Private profiles are never shown, and look the same as profiles that do not exist.
Running the app locally (Windows PowerShell)
Requirements
Node.js 22.22 or newer (node -v). Download from https://nodejs.org.
pnpm 10.14.0. You do not need to install it; npx runs it for you.
Git.
1. Get the code

Keep the project outside OneDrive and in a folder path without spaces (for example C:\Projects). OneDrive syncing node_modules makes the app slow, and spaces in the path break the framework's commands.

powershell
git clone https://github.com/Gudadze2000/pea_masters.git
cd pea_masters
git checkout <your-branch>
2. Install dependencies
powershell
npx pnpm@10.14.0 install

This takes a few minutes the first time. A warning about ignored build scripts is expected.

3. Create the settings file
powershell
Copy-Item .env.example .env

.env is never committed. It contains:

AUTH_SIGNUP=invited
AUTH_BOOTSTRAP_ADMINS=admin@test.local

Only the emails listed in AUTH_BOOTSTRAP_ADMINS (comma-separated) can create an account. Add the emails you need, then restart the app. Do not set AUTH_DISABLED=true unless you want to skip sign-in on your own machine.

4. Prepare the local database
powershell
mkdir data\pglite
npx pnpm@10.14.0 db:migrate

The database lives in data/ on your computer and is never committed. Run db:migrate again whenever you pull changes that add files to drizzle/migrations.

5. Start the app
powershell
npx pnpm@10.14.0 dev

Wait for App listening on http://localhost:8080/ (the first start can take a minute or two), then open http://localhost:8080/.

On later days you only need cd into the folder and step 5.

6. Create an account

The sign-in page has no sign-up form. Accounts are created by an administrator. With the app running, run this in a second PowerShell window (the email must be in AUTH_BOOTSTRAP_ADMINS; the password needs at least 12 characters):

powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8080/_agent-native/auth/register -ContentType "application/json" -Body '{"email":"admin@test.local","password":"choose-a-long-password"}'

It prints ok : True. Then sign in at http://localhost:8080/.

Stopping and restarting

Press Ctrl+C in the terminal running the app. Run only one copy at a time: the local database allows a single process.

Troubleshooting
Problem	Fix
'agent-native' is not recognized	Dependencies are not installed in this folder. Run step 2.
'C:\...\Folder' is not recognized	The folder path contains a space. Move the project to a path without spaces.
ENOENT ... data\pglite	Run mkdir data\pglite, then step 4 again.
PGlite database directory ... is already owned by process	Another copy is running. Run Get-Process node | Stop-Process -Force, then step 5 once.
Registration says the email is not allowed	Add the email to AUTH_BOOTSTRAP_ADMINS in .env and restart the app.
Choose a password with at least 12 characters.	Use a longer password.
Browser shows an ECONNRESET overlay	Press Esc, reload the page, restart the app if it persists.
Very high memory use	Make sure the project is outside OneDrive and only one copy is running.
pnpm build reports production configuration errors	Expected locally. Production needs DATABASE_URL (Postgres), BETTER_AUTH_SECRET, and AUTH_DISABLED unset.
Project layout
app/routes/: pages (_index.tsx home, profile.tsx, profile-sections.tsx, preferences.tsx, profiles.tsx, people.tsx, publication.tsx, evaluations.tsx).
app/components/profile/: shared header (AppBar), photo avatar, publication list.
app/lib/: entry categories and plain-language error messages.
actions/: server operations used by the pages. Every action works only on the signed-in user's own data.
server/routes/api/public/: the read-only endpoints guests use (public profiles, one profile, one publication, a photo). They return data only for public profiles.
server/plugins/auth.ts: sign-in page and the list of guest-accessible paths (publicPaths).
drizzle/: database schema and migrations.
DESIGN.md: the visual direction (Oxblood palette).
Privacy rules
A profile is private until its owner switches it to Public.
Entries are hidden until their owner clicks Show.
Removed publications and hidden entries never appear to guests.
Shared patents and projects are read-only for the person they are shared with.
Evaluations are private to the account that created them.
The date of birth is shown on a public profile. Leave it empty if you do not want it shown.
Not built yet
CV creation with Word (.docx) download, in English and Georgian.
Georgian versions of profile fields, and Georgian interface text (the language setting is stored only).
Search and import from PubMed, Scopus and Web of Science (Scopus and Web of Science need API keys).
ORCID synchronisation (needs an ORCID developer registration).
Google sign-in, e-mail alerts, and login by proxy.
Team workflow
main: production releases only. Merge into it from dev.
dev: integration branch. Merge personal branches here through a pull request.
giorgiKekelidze: personal working branch. Work only on your own branch.

Before starting new work, run git pull origin dev and merge dev into your branch. Never commit .env, data/ or node_modules; .gitignore already excludes them.