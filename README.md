# Personnel Evaluation

A workspace for Ilia State University staff to record and track personnel
evaluations. Each evaluation scores teaching, research and service on a 0–5
scale, keeps a notes field, and moves from **draft** to **submitted**. Records
are private to the account that created them.

Built on the [Agent-Native](https://agent-native.com) framework.

## Run it

Requires Node 22.22+ and pnpm 10.14 (`corepack enable` provides pnpm).

```bash
cp .env.example .env
# For local use without sign-in, uncomment AUTH_DISABLED=true in .env.
pnpm install
pnpm db:migrate     # creates the local database (PGlite) in data/
pnpm dev            # open the URL it prints (http://localhost:5173 by default)
```

For a hosted deployment, set `BETTER_AUTH_SECRET` (and `DATABASE_URL` for
Postgres) and run `pnpm build` then `pnpm start`.

## What's in it

- `drizzle/schema.ts`: the `evaluations` table, with range checks on scores and
  status values.
- `actions/`: `list-evaluations`, `create-evaluation`, `update-evaluation`,
  `delete-evaluation`. Every action is scoped to the signed-in user.
- `app/routes/_index.tsx`: the dashboard, evaluation list, and entry form.
- `DESIGN.md`: the visual direction (Oxblood Academy) the UI follows.

## Project layout

- `app/`: routes and UI components
- `actions/`: operations shared by the UI and the app's agent
- `server/`: server plugins and the database client
- `drizzle/`: schema and migrations; start with `drizzle/START_HERE.md`

Framework docs: [agent-native.com/docs](https://agent-native.com/docs).
