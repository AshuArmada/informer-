# Informer

A personal, local-only AI assistant for finding open source contributions.

1. **Contribute** — discover public repositories by topic, language, and good first issues. Inspect activity, contribution rules, sampled PR acceptance metrics, and current issues by label or assignee status. Get personalized AI guidance based on your skills and live repository evidence.
2. **Trending feed** — GitHub repositories ranked by star velocity, updating via SSE.
3. **Saved projects** — bookmark repositories for later.
4. **Repo reports** — issues grouped by assignee and PR counts, emailed on demand or on a schedule.

**Web discoveries** adds web scraping with [Scrapling](https://scrapling.readthedocs.io/en/latest/parsing/main_classes.html): browse popular and newcomer-friendly repositories from public discovery pages, filter by source or language, and open any project for contribution analysis.

Configure the GitHub PAT in **Settings** for repository search and analysis. Web discovery listings need no token or AI key; AI guidance supports local Ollama, Google Gemini, and OpenAI. See [Contribution discovery](./docs/contributions.md) for setup and metric definitions.

**Repository filters:** refine GitHub discovery by topic tag, custom open-issue label,
unassigned issues, language, license, minimum stars, and recent activity. Use quick
starts for beginner issues, help wanted, bugs, or documentation. Group loaded
projects by language, first topic tag, or license. Filtered searches automatically
check up to two 12-project batches to fill sparse results; counts distinguish
candidate repositories from verified matches. First contributions targets projects
with good first issues before verifying their labels.
Recent search results are cached for two minutes. If GitHub's search quota is
exhausted, a countdown shows when to retry while verified projects stay visible.

**API connections:** Settings now manages OpenAI/Gemini keys, all three AI models,
the default provider, timeout, and local Ollama address. Save, replace, remove, and
test connections without editing `.env` or restarting. Keys are encrypted in the
database and never returned to the page. GitHub endpoints and cloud API hosts stay
fixed to protect credentials. See [security controls and limits](./docs/security.md).

Existing installations need the new provider-settings migration: the launcher runs
it automatically, or run `./.venv/Scripts/python -m alembic upgrade head` from
`backend`. No new packages are required.

See [CLAUDE.md](./CLAUDE.md) for the full architecture and design decisions.

## Prerequisites

- Python 3.12+
- Node.js 20.19+ or 22.12+
- Docker Desktop

## Quick start (Windows)

Start Docker Desktop, then double-click `start.bat` or run it from a terminal:

```powershell
.\start.bat
```

The launcher creates the Python virtual environment, installs missing dependencies,
creates `backend/.env` with an encryption key on first run, starts PostgreSQL and
Adminer, applies migrations, and starts the API and frontend. Existing `.env`
settings are preserved. Open http://127.0.0.1:5173 when it reports ready.

Keep the terminal open; press **Ctrl+C** to stop the API and frontend. Logs are in
`logs/`. Docker services keep running; use `docker compose stop db adminer` to stop
them without removing database data.

The launcher automatically reinstalls backend dependencies when `backend/pyproject.toml`
changes (including the Scrapling dependency). Run `.\start.bat -InstallDependencies`
to force a reinstall of both backend and frontend dependencies, or after frontend
dependency changes.
The manual setup steps below remain available for other platforms.

## Web discovery sources

Open **Contribute → Web discoveries** to browse these pages:

| Source | What it helps discover |
| --- | --- |
| [GitHub Trending](https://github.com/trending) | Repositories attracting attention today. |
| [Good First Issue](https://goodfirstissue.dev/) | Projects listed for first-time open source contributions. |

Cards include source links, descriptions, languages, and source-reported star
counts. Search the fetched sample by project name or description, filter by source
and language, or sort by stars. Duplicate repositories appear once with all their
source labels. **Explore contribution fit** opens the existing live GitHub analysis
of contribution rules, activity, PR metrics, and open issues. Popularity or a listing
does not guarantee current beginner issues or maintainer acceptance.

For an existing installation, install the new dependency and restart:

```powershell
.\start.bat -InstallDependencies
```

Alternatively, run `pip install -e .` inside the backend virtual environment from
`backend/`, then restart the backend. No new environment variables, scraping service
key, browser download, or database migration is required. Scrapling parses the HTML;
the existing HTTPX library downloads the two fixed public pages asynchronously.

Each source contributes at most 60 projects per fetch. Successful results are cached
in memory for 15 minutes; **Refresh sources** respects this interval. Failed sources
retry on the next request after one minute, with a visible status. If available,
the last successful results remain visible for up to 24 hours and are marked as
older cached results. Restarting the backend clears this cache.

Source timestamps describe when Informer fetched a page, not when its publisher
updated it. Star counts may be rounded or outdated. Source markup changes, rate
limits, or outages can make an individual source unavailable. The app fetches only
the listed pages, does not follow redirects or crawl linked repositories, and sends
no GitHub token to discovery sources. The existing SSE trending feed continues to
use GitHub API snapshots.

API: `GET /api/contributions/web` returns repositories with source provenance,
per-source fetch timestamps, cache/stale flags, errors, and sample-limit indicators.

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

- **Classic PAT:** public discovery needs no broad `repo` scope; private reports need `repo` access.
- **Fine-grained PAT:** needs read access to Metadata, Issues, Pull requests, and Contents,
  scoped to the repos/orgs you want reports for.

Create one at https://github.com/settings/tokens (classic) or
https://github.com/settings/personal-access-tokens (fine-grained). Click **Validate token**
after saving to confirm it works — the app shows which GitHub account it authenticated as.

The token is encrypted at rest in Postgres and is never sent back to the browser; the UI only
ever shows a masked hint (e.g. `ghp_••••1234`).

## 5. AI contribution guidance (optional)

Open **Settings → AI connections** to choose a default provider, set models and keys,
then save. New requests use the settings immediately. The advisor can override the
provider for an individual request. The `.env` examples below are optional
installation defaults; changes to those defaults require restarting the backend.

**Local Ollama (no API key):**

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
AI_TIMEOUT_SECONDS=180
```

Run `ollama pull llama3.2:3b`, then start the Ollama app or run `ollama serve`. The address is relative to the backend machine. Larger models and cold starts may need a longer timeout (up to 600 seconds).

**Google Gemini:**

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-2.5-flash
```

**OpenAI:**

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4.1-mini
```

Keys stay on the backend. Only the selected provider receives your skills, experience, and public repository evidence; GitHub credentials are never included. There is no automatic provider fallback. Ollama is local by default; configuration does not mean its server is running or its model is installed. See [provider setup and limitations](./docs/contributions.md).

## 6. SMTP (for the Reports feature)

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
