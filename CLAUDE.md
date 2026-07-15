# Informer

A personal, local-only, single-user dashboard with two features:

1. **Trending feed** — GitHub trending repos, ranked by star velocity, updating live via SSE.
2. **Repo issue/PR reports** — for repos you track, shows open issues grouped by assignee + PR counts, emailed on demand or on a schedule.

No login. Read-only toward GitHub (never writes back issues/PRs/comments). No other data sources in v1.

## Stack

- **Backend:** Python 3.12, FastAPI + Uvicorn (async — needed for SSE and concurrent GitHub calls).
  `httpx` (GitHub client), SQLAlchemy 2.0 async + `asyncpg`, Alembic (migrations), APScheduler (report schedule), `aiosmtplib` + Jinja2 (SMTP + HTML email), `pydantic-settings` (`.env` config), `cryptography` (Fernet — encrypts the stored PAT).
- **Database:** PostgreSQL 16, run via `docker-compose.yml` (+ Adminer for browsing). Only the DB is containerized in dev; backend and frontend run locally.
- **Frontend:** React + Vite + TypeScript + Tailwind + shadcn/ui. Deliberately minimal hand-written CSS — shadcn primitives + Tailwind utilities only.
- **Live updates:** Server-Sent Events (`sse-starlette`), not WebSockets — one-directional server→client push is all the trending feed needs.

## Key design decisions (don't relitigate these without asking the user)

- **No official GitHub "trending" API exists.** We use the GitHub Search API (ToS-compliant) and approximate trending as recently-created/pushed repos ranked by star count, with **star velocity** (delta between polling snapshots) as the real ranking signal. Scraping github.com/trending was explicitly rejected.
- **"Near-live" = polling + SSE**, not a GitHub webhook or true real-time stream (no such thing exists for stars/trending). Default poll interval 10 min, configurable.
- **Star velocity needs at least two poll cycles of history** to mean anything. First run after a fresh DB will just show raw star-count ranking — that's expected, not a bug.
- **GitHub PAT is managed in-app (Settings page), not `.env`.** Accepts both classic (`ghp_…`) and fine-grained (`github_pat_…`) tokens. Stored **encrypted at rest** in Postgres (Fernet, key = `SECRET_KEY` env var). The raw token is **never** sent back to the frontend — only a masked hint (`ghp_••••1234`) and a validity/login status from calling `GET /user`.
- **Reports cover the user's own repos/orgs** (not arbitrary public repos) — this is why the PAT needs `repo` scope (classic) or Metadata/Issues/Pull requests/Contents read (fine-grained), not just public access.
- **Email is sent via the user's own SMTP account** (e.g. Gmail app password), not a third-party transactional API. SMTP credentials stay in `.env` (not moved into Settings UI — deliberate scope cut, only the PAT got in-app management).
- **The GitHub issues endpoint returns PRs too** — `report_generator.py` must filter out entries with a `pull_request` field when computing issue-only assignee groupings.
- **No automated test suite planned for v1** (single-user personal tool) — verification is manual, per the plan file's Verification section.

## Data model (Postgres, Alembic-managed)

- `app_settings` — single row: encrypted GitHub PAT, cached GitHub login, updated_at.
- `snapshots` — trending history: repo_full_name, stars, description, language, html_url, captured_at. Ranking computed at read time from each repo's latest two snapshots.
- `tracked_repos` — owner, name, added_at (which repos are included in reports).
- `report_schedule` — single row: enabled, cadence (daily|weekly), time, day_of_week, email.
- `report_log` — sent_at, email, repo_count, status (audit trail for unattended scheduled sends).

## API surface

- `GET/PUT /api/settings`, `POST /api/settings/validate` — PAT management.
- `GET /api/trending`, `GET /api/stream` (SSE) — trending feed.
- `GET /api/repos`, plus tracked-repo CRUD — repo picker for reports.
- `GET /api/report` (preview), `POST /api/report/send`, schedule CRUD — reports.

## Repo layout

```
informer/
  docker-compose.yml        # Postgres 16 + Adminer
  backend/
    app/
      main.py                # FastAPI app + lifespan (starts poller & scheduler)
      config.py               # pydantic-settings
      db.py                    # async engine/session, Base
      models.py                 # SQLAlchemy models
      schemas.py                 # Pydantic request/response models
      github.py                   # async GitHub client
      poller.py                    # trending fetch + velocity ranking + SSE broadcast
      report_generator.py           # per-repo issues-by-assignee + PR counts
      mailer.py                      # aiosmtplib + Jinja2
      scheduler.py                    # APScheduler job for report_schedule
      routers/                         # settings, trending, stream, repos, report
      templates/report.html.j2          # email template
    alembic/
    pyproject.toml
    .env.example
  frontend/
    src/
      App.tsx                 # nav: Trending | Reports | Settings
      lib/api.ts
      components/ui/...       # shadcn primitives
      features/
        settings/ trending/ reports/
      hooks/useTrendingStream.ts
    tailwind.config.ts
    vite.config.ts
  README.md
```

## Out of scope for v1 (backlog)

Other feed sources (HN/npm/PyPI/CVEs), trending filter/search, bookmarking, auth/multi-user, containerizing backend/frontend + cloud deploy, writing back to GitHub, SMTP creds in Settings UI, rich report-history UI beyond `report_log`.

## Full plan

The detailed milestone-by-milestone build plan lives at `C:\Users\Homework\.claude\plans\curious-inventing-milner.md` (outside this repo, in Claude Code's plan storage — not guaranteed to persist across machines, so the essentials above are duplicated here).
