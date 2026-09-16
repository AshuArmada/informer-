# Contribution discovery

Open **Contribute**, the app's default view. Search a topic, select a programming language, and optionally require projects with good first issues. Search returns up to 12 public, non-archived, non-fork repositories pushed in the last 90 days, ordered by recent updates. Enter `owner/repository` or a GitHub repository URL to inspect a specific project directly; discovery filters do not apply to direct inspection.

## Setup

Start PostgreSQL and the backend as described in the README. Save and validate a GitHub PAT in Settings. Public repository analysis needs read access to metadata, issues, pull requests, and contents. Existing private-repository reports keep their own broader token requirements. Contribution discovery rejects private repositories.

For AI guidance, set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in `backend/.env`, then restart the backend. The default model is `gpt-4.1-mini`. No new database migration or dependency is required. A key is unnecessary for repository analysis, rules, or issue filtering.

## What the repository view shows

- **Activity:** archived/disabled status and last push. “Recently active” means a push in the last 30 days; this does not establish maintainer responsiveness.
- **Contribution rules:** links detected by GitHub's community profile, including contribution guide, README, license, code of conduct, and templates. The contribution guide preview is capped at 16,000 characters. Missing detection does not establish that a repository has no rules; check its README, organization guidance, and discussions.
- **Acceptance activity:** inspect at most 100 closed PRs, ordered by last update. Restrict calculations to PRs closed in the last 90 days. Merge rate is merged / closed in that sample; median merge time is creation to merge; active merge weeks are distinct ISO calendar weeks with sampled merges. Maintainers and bots are included. These are historical sample statistics, not a contributor's acceptance probability or an exhaustive repository-wide rate. Zero eligible closures gives an unknown rate. Reaching the cap is disclosed.
- **Community documents:** GitHub's percentage measures coverage of recommended community files, not the project's overall quality or review speed.
- **Current issues:** the latest 100 updated open issue/PR records, with PRs filtered out. Label counts and filters apply to this bounded sample. Search by title or number, filter by an exact label, or show unassigned issues. Links to GitHub expose the full issue list.
- **AI advisor:** enter skills and experience, then generate a plan. The backend fetches fresh evidence and sends bounded public repository data, guide excerpts, and up to 20 issues to OpenAI. It prioritizes unassigned issues and conventional `good first issue` / `help wanted` labels. Repository content is treated as untrusted evidence. Advice is generated text and should be checked against source documents; it does not submit contributions.

Unavailable GitHub sections are explicitly marked unavailable, rather than reported as zero. The app does not fabricate example repository data or pretend a rules-based fallback is AI. Requests are read-only toward GitHub. The OpenAI key remains server-side, and Responses requests specify `store: false`.

## API

- `GET /api/contributions/config` — whether AI is configured; never returns credentials.
- `GET /api/contributions/search?q=&language=&beginner=true` — repository discovery.
- `GET /api/contributions/repos/{owner}/{name}` — evidence and calculated metrics.
- `POST /api/contributions/repos/{owner}/{name}/advice` — accepts `{ "skills": "Python, testing", "experience": "beginner" }`; experience can also be `intermediate` or `experienced`.

## Verification

```powershell
cd frontend
npm run build
npm run lint
cd ../backend
./.venv/Scripts/python -m pytest tests/test_contributions.py tests/test_report_generator.py tests/test_security.py -q
```

The full test suite also includes an application startup health check that requires the configured PostgreSQL database. AI request/response handling is tested with a mocked provider; a live AI call requires a working key, model access, and quota.

Implementation references: [GitHub community metrics](https://docs.github.com/en/rest/metrics/community), [GitHub pull requests](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests), and [OpenAI text generation](https://developers.openai.com/api/docs/guides/text).
