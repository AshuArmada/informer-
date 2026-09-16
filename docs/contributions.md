# Contribution discovery

Open **Contribute**, the app's default view. Search a topic, select a programming language, and optionally require projects with good first issues. The page automatically loads a discovery feed. Search returns 12 public, non-archived, non-fork repositories per page, pushed in the last 90 days. Choose Active projects or New projects (also created in the last 90 days), and sort by recent updates or stars. Load more adds the next page using the applied filters, up to 300 matches. Refresh projects fetches the first page again. Cards show language, stars, topics, license, creation date, last push, and open issues plus PRs; the combined count is not an issue-only count. A good-first-issue badge appears when that discovery filter was applied. Rules and merge statistics load when opening project analysis. Enter `owner/repository` or a GitHub repository URL to inspect a specific project directly; discovery filters do not apply to direct inspection.

## Setup

Start PostgreSQL and the backend as described in the README. Save and validate a GitHub PAT in Settings. Public repository analysis needs read access to metadata, issues, pull requests, and contents. Existing private-repository reports keep their own broader token requirements. Contribution discovery rejects private repositories.

For AI guidance, configure providers in `backend/.env` and restart the backend:

| Provider | Default selection | Required configuration | Default model |
| --- | --- | --- | --- |
| OpenAI | `AI_PROVIDER=openai` | `OPENAI_API_KEY` | `OPENAI_MODEL=gpt-4.1-mini` |
| Gemini | `AI_PROVIDER=gemini` | `GEMINI_API_KEY` | `GEMINI_MODEL=gemini-2.5-flash` |
| Ollama | `AI_PROVIDER=ollama` | Running Ollama server and pulled model; no API key | `OLLAMA_MODEL=llama3.2:3b` |

OpenAI remains the default for existing installations. The advisor's provider selector allows per-request overrides. Cloud credentials remain server-side. Missing credentials display setup instructions for that provider. Configured means configuration is present, not that the provider has passed a connectivity or quota check.

For local inference, run `ollama pull llama3.2:3b` and start the Ollama app or `ollama serve`. `OLLAMA_BASE_URL` defaults to `http://127.0.0.1:11434`; it must be reachable from the backend, not the browser. `OLLAMA_MODEL` can name another installed chat model. `AI_TIMEOUT_SECONDS` defaults to 180, accepts 10-600, and covers all providers. Ollama uses a 32,768-token context and 1,400-token output budget; a capable instruction-following model and sufficient memory are recommended for repository evidence. Cloud-backed Ollama models or remote endpoints are not local inference; use a locally downloaded model and the default loopback endpoint when you want local processing.

Guidance goes only to the selected provider, with no automatic fallback. Ollama requests bypass environment HTTP proxies. Failed, empty, blocked, or truncated responses are reported as errors. The adapter uses Ollama `/api/chat`, Gemini `generateContent`, or OpenAI Responses. No new dependency or database migration is needed. GitHub analysis and filters do not require an AI provider.

## What the repository view shows

- **Activity:** archived/disabled status and last push. “Recently active” means a push in the last 30 days; this does not establish maintainer responsiveness.
- **Contribution rules:** links detected by GitHub's community profile, including contribution guide, README, license, code of conduct, and templates. The contribution guide preview is capped at 16,000 characters. Missing detection does not establish that a repository has no rules; check its README, organization guidance, and discussions.
- **Acceptance activity:** inspect at most 100 closed PRs, ordered by last update. Restrict calculations to PRs closed in the last 90 days. Merge rate is merged / closed in that sample; median merge time is creation to merge; active merge weeks are distinct ISO calendar weeks with sampled merges. Maintainers and bots are included. These are historical sample statistics, not a contributor's acceptance probability or an exhaustive repository-wide rate. Zero eligible closures gives an unknown rate. Reaching the cap is disclosed.
- **Community documents:** GitHub's percentage measures coverage of recommended community files, not the project's overall quality or review speed.
- **Current issues:** up to 100 recently updated open issues from GitHub's issue-only search. Pull requests do not consume the issue limit. The repository view includes GitHub's reported total and marks incomplete search results. Label counts and filters apply to this bounded sample. Search by title or number, filter by an exact label, or show unassigned issues. Links to GitHub expose the full issue list.
- **AI advisor:** enter skills and experience, then generate a plan. The backend fetches fresh evidence and sends bounded public repository data, guide excerpts, and up to 20 issues to the selected AI provider. It prioritizes unassigned issues and conventional `good first issue` / `help wanted` labels. Repository content is treated as untrusted evidence. Advice is generated text and should be checked against source documents; it does not submit contributions.

Unavailable GitHub sections are explicitly marked unavailable, rather than reported as zero. The app does not fabricate example repository data or pretend a rules-based fallback is AI. Requests are read-only toward GitHub. API keys remain server-side; OpenAI Responses requests specify `store: false`. This flag does not describe Gemini or Ollama retention.

## API

- `GET /api/contributions/config` — default provider, provider names/models and configuration status; never returns credentials or server URLs.
- `GET /api/contributions/search?q=&language=&beginner=true&collection=active&sort=updated&page=1` — repository discovery.
- `GET /api/contributions/repos/{owner}/{name}` — evidence and calculated metrics.
- `POST /api/contributions/repos/{owner}/{name}/advice` — accepts `{ "skills": "Python, testing", "experience": "beginner" }`; experience can also be `intermediate` or `experienced`. An optional `provider` (`openai`, `ollama`, or `gemini`) overrides `AI_PROVIDER` for that request. Responses include the provider and configured model.

## Verification

```powershell
cd frontend
npm run build
npm run lint
cd ../backend
./.venv/Scripts/python -m pytest tests/test_contributions.py tests/test_report_generator.py tests/test_security.py -q
```

The full test suite also includes an application startup health check that requires the configured PostgreSQL database. All provider adapters are tested with mocked responses, including credentials isolation, missing configuration, truncation, and connection failure. Live cloud calls require working keys, model access, and quota. Live Ollama calls require a running server and a pulled model.

Implementation references: [GitHub community metrics](https://docs.github.com/en/rest/metrics/community), [GitHub pull requests](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests), and [OpenAI text generation](https://developers.openai.com/api/docs/guides/text).

Provider references: [Ollama chat API](https://docs.ollama.com/api/chat) and [Gemini generateContent API](https://ai.google.dev/api/generate-content).

## Navigation and recovery

Repository links (including links to issues or files within a repository) open that project's analysis. Its URL is retained in `#contribute?repo=...`, so reload, browser history, and saved-project links work. Topic/language/beginner search drafts persist for the browser session when visiting Settings. Filters apply to discovery searches, not direct repository inspection.

Save/unsave buttons check bookmark status and display errors on failure. Saved cards link back to contribution analysis. Repository refresh and request retries fetch new evidence. Issue filters can be cleared together. AI configuration can be retried without reloading. Stop waiting cancels the browser's wait; it does not guarantee the AI provider stops processing or billing an already submitted request.

Flow audit covered discovery, URL parsing, saved-project navigation, save/unsave failure recovery, provider retry/switching/cancellation, browser history, issue filtering, and report setup/tracking error recovery using mocked browser API responses. Live GitHub issue search was also checked. Full database-backed application startup requires the configured PostgreSQL service.
