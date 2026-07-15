# Informer

A personal, local-only dashboard with two features:

1. **Trending feed** — GitHub trending repos, ranked by star velocity, updating live via SSE. *(not built yet)*
2. **Repo issue/PR reports** — for repos you track, shows open issues grouped by assignee + PR counts, emailed on demand or on a schedule. *(not built yet)*

Currently implemented: the **Settings page**, where you configure the GitHub PAT both features depend on.

See [CLAUDE.md](./CLAUDE.md) for the full architecture and design decisions.

## Prerequisites

- Python 3.12+
- Node.js 20+
- Docker Desktop

## 1. Start the database

```bash
docker compose up -d db adminer
```

This starts Postgres 16 on **host port 5433** (not 5432 — chosen to avoid colliding with any
native Postgres install you might already have running) and Adminer at http://localhost:8080
(system: PostgreSQL, server: `db` or `localhost:5433`, user/password/db: `informer`).

## 2. Backend

```bash
cd backend
python -m venv .venv
./.venv/Scripts/pip install -e .        # macOS/Linux: .venv/bin/pip
cp .env.example .env
```

Generate a Fernet key for `SECRET_KEY` in `.env`:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Run migrations, then start the API:

```bash
./.venv/Scripts/python -m alembic upgrade head
./.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

The API is now at http://127.0.0.1:8000 (health check: `/api/health`).

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — the Vite dev server proxies `/api/*` to the backend, so no CORS
setup is needed in dev.

## 4. Configure your GitHub token

In the app, go to **Settings** and paste a GitHub Personal Access Token. Both classic
(`ghp_…`) and fine-grained (`github_pat_…`) tokens work.

- **Classic PAT:** needs the `repo` scope.
- **Fine-grained PAT:** needs read access to Metadata, Issues, Pull requests, and Contents,
  scoped to the repos/orgs you want reports for.

Create one at https://github.com/settings/tokens (classic) or
https://github.com/settings/personal-access-tokens (fine-grained). Click **Validate token**
after saving to confirm it works — the app shows which GitHub account it authenticated as.

The token is encrypted at rest in Postgres and is never sent back to the browser; the UI only
ever shows a masked hint (e.g. `ghp_••••1234`).

## 5. SMTP (for the Reports feature, once built)

Set `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` in `backend/.env`.
For Gmail, use an app password (not your account password):
https://myaccount.google.com/apppasswords

## Project layout

```
informer/
  docker-compose.yml   # Postgres 16 + Adminer
  backend/              # FastAPI + SQLAlchemy (async) + Alembic
  frontend/              # React + Vite + TypeScript + Tailwind + shadcn/ui
```

See [CLAUDE.md](./CLAUDE.md) for the full data model, API surface, and build milestones.
