# Contribution discovery

Open **Contribute**, the app's default view. Search a topic, select a programming language, and optionally require projects with good first issues. The page automatically loads a discovery feed. Search returns 12 public, non-archived, non-fork repositories per page, pushed in the last 90 days. Choose Active projects or New projects (also created in the last 90 days), and sort by recent updates or stars. Load more adds the next page using the applied filters, up to 300 matches. Refresh projects fetches the first page again. Cards show language, stars, topics, license, creation date, last push, and open issues plus PRs; the combined count is not an issue-only count. A good-first-issue badge appears when that discovery filter was applied. Rules and merge statistics load when opening project analysis. Enter `owner/repository` or a GitHub repository URL to inspect a specific project directly; discovery filters do not apply to direct inspection.

## Repository categories and filters

In GitHub search, **Refine your search** adds topic tags, arbitrary open-issue labels,
unassigned issues, license, minimum stars, and last-push windows of 7/30/90/365 days.
The default window remains 90 days; New projects always means created within 90 days.
All selected filters combine. Search accepts plain text; use the controls for
qualifiers. Quick starts reset filters to an issue category. Clicking a card's topic
starts a fresh search for that tag. Draft filters persist for the browser session.

Repository search returns up to 12 candidates at a time. Custom issue labels and
assignment availability are verified through issue-only open-issue searches for each
candidate, with at most three concurrent requests. The returned `total_count` is the
candidate count **before** those issue filters. `scanned_count` records checked
candidates and `matching_issues` on cards records matching open issues. A batch can
have no matches even when more candidates remain. Load more checks the next batch;
pagination stays bounded to the first 300 repository candidates. Failed checks omit
that candidate and return warnings, never fabricated counts. This uses additional
GitHub search quota and can hit upstream rate limits.

**Group by** organizes only loaded matches by language, first topic tag, or license.
It does not imply a complete inventory of that category across GitHub.

Additional search parameters: `topic`, `license`, `min_stars`, `activity_days`,
`issue_label`, and `unassigned`. Provider management uses GET/PUT/DELETE at
`/api/settings/providers` and POST at `/api/settings/providers/{provider}/test`.
`DELETE /api/settings` removes the GitHub token. All mutating requests require
the protection headers described in [local application security](./security.md).

## Web discoveries

Select **Web discoveries** on the Contribute page to browse a separate collection
scraped from [GitHub Trending](https://github.com/trending) and
[Good First Issue](https://goodfirstissue.dev/). This collection needs no GitHub
token; opening contribution analysis still needs the PAT configured in Settings.
Source cards show their fetch time and availability. Project cards show source
labels, descriptions, languages, and approximate source-reported stars. Filter by
project text, source, or language, sort by stars, and use **Show more projects** to
browse the sample. GitHub search filters do not apply to this collection.

The backend uses Scrapling's HTML selectors and HTTPX downloads, with fixed HTTPS
source URLs, no redirect following, a 2 MB decoded response limit, and a 20-second
overall timeout per source. It extracts at most 60 repository cards per source,
deduplicates repository names case-insensitively, and retains each source link.
Scraped links are validated as GitHub repository roots; linked pages are not crawled.
No GitHub credentials or authenticated browser cookies are used for scraping.

Successful source results are cached independently for 15 minutes in process memory.
Refresh respects the cache. Failed sources can retry after one minute. A failed
refresh may serve a marked stale result up to 24 hours after its last successful
fetch; the original fetch timestamp is retained. Partial failures leave other sources
available. Missing metadata remains unknown. An empty or changed page produces a
visible source error rather than invented repository data.

These pages provide leads, not verified contribution availability. They may include
archived projects or stale listings. Use **Explore contribution fit** to fetch the
current public GitHub evidence and check project status, rules, and issues. No scraped
HTML is rendered or sent to the AI advisor. The existing trending feed keeps its
GitHub API polling and SSE behavior.

Existing installations should run `start.bat -InstallDependencies`, or reinstall
the backend with `pip install -e .` in its virtual environment. No browser binaries,
service API key, environment changes, or database migration are needed.

## Setup

Start PostgreSQL and the backend as described in the README. Save and validate a GitHub PAT in Settings. Public repository analysis needs read access to metadata, issues, pull requests, and contents. Existing private-repository reports keep their own broader token requirements. Contribution discovery rejects private repositories.

For AI guidance, use **Settings → AI connections** to save provider keys, models,
timeout, and default selection. Settings take effect on new requests immediately.
Keys stay encrypted on the server. Blank key inputs preserve the saved credential;
the removal checkbox disables that provider, including environment fallback.
Connection tests check credentials/connectivity without generating advice.
Alternatively, set installation defaults in `backend/.env` and restart the backend:

| Provider | Default selection | Required configuration | Default model |
| --- | --- | --- | --- |
| OpenAI | `AI_PROVIDER=openai` | `OPENAI_API_KEY` | `OPENAI_MODEL=gpt-4.1-mini` |
| Gemini | `AI_PROVIDER=gemini` | `GEMINI_API_KEY` | `GEMINI_MODEL=gemini-2.5-flash` |
| Ollama | `AI_PROVIDER=ollama` | Running Ollama server and pulled model; no API key | `OLLAMA_MODEL=llama3.2:3b` |

OpenAI remains the default for existing installations. The advisor's provider selector allows per-request overrides. Cloud credentials remain server-side. Missing credentials display setup instructions for that provider. Configured means configuration is present, not that the provider has passed a connectivity or quota check.

For local inference, run `ollama pull llama3.2:3b` and start the Ollama app or `ollama serve`. `OLLAMA_BASE_URL` defaults to `http://127.0.0.1:11434`; it must be reachable from the backend, not the browser. `OLLAMA_MODEL` can name another installed chat model. `AI_TIMEOUT_SECONDS` defaults to 180, accepts 10-600, and covers all providers. Ollama uses a 32,768-token context and 1,400-token output budget; a capable instruction-following model and sufficient memory are recommended for repository evidence. Cloud-backed Ollama models or remote endpoints are not local inference; use a locally downloaded model and the default loopback endpoint when you want local processing.

Guidance goes only to the selected provider, with no automatic fallback. Ollama requests bypass environment HTTP proxies. Failed, empty, blocked, or truncated responses are reported as errors. The adapter uses Ollama `/api/chat`, Gemini `generateContent`, or OpenAI Responses. Switching AI providers requires no additional dependency or database migration. GitHub analysis and filters do not require an AI provider.

## What the repository view shows

- **Activity:** archived/disabled status and last push. “Recently active” means a push in the last 30 days; this does not establish maintainer responsiveness.
- **Contribution rules:** links detected by GitHub's community profile, including contribution guide, README, license, code of conduct, and templates. The contribution guide preview is capped at 16,000 characters. Missing detection does not establish that a repository has no rules; check its README, organization guidance, and discussions.
- **Acceptance activity:** inspect at most 100 closed PRs, ordered by last update. Restrict calculations to PRs closed in the last 90 days. Merge rate is merged / closed in that sample; median merge time is creation to merge; active merge weeks are distinct ISO calendar weeks with sampled merges. Maintainers and bots are included. These are historical sample statistics, not a contributor's acceptance probability or an exhaustive repository-wide rate. Zero eligible closures gives an unknown rate. Reaching the cap is disclosed.
- **Community documents:** GitHub's percentage measures coverage of recommended community files, not the project's overall quality or review speed.
- **Current issues:** up to 100 recently updated open issues from GitHub's issue-only search. Pull requests do not consume the issue limit. The repository view includes GitHub's reported total and marks incomplete search results. Label counts and filters apply to this bounded sample. Search by title or number, filter by an exact label, or show unassigned issues. Links to GitHub expose the full issue list.
- **AI advisor:** enter skills and experience, then generate a plan. The backend fetches fresh evidence and sends bounded public repository data, guide excerpts, and up to 20 issues to the selected AI provider. It prioritizes unassigned issues and conventional `good first issue` / `help wanted` labels. Repository content is treated as untrusted evidence. Advice is generated text and should be checked against source documents; it does not submit contributions.

Unavailable GitHub sections are explicitly marked unavailable, rather than reported as zero. The app does not fabricate example repository data or pretend a rules-based fallback is AI. Requests are read-only toward GitHub. API keys remain server-side; OpenAI Responses requests specify `store: false`. This flag does not describe Gemini or Ollama retention.

## API

- `GET /api/contributions/web` — public-page repository leads and per-source provenance, timestamps, cache/stale flags, errors, counts, and sample limits; no GitHub token required.
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
./.venv/Scripts/python -m pytest tests/test_web_discovery.py tests/test_contributions.py tests/test_report_generator.py tests/test_security.py -q
```

The automated suite isolates health routing from startup jobs and does not need a running database. All provider adapters are tested with mocked responses, including credentials isolation, missing configuration, truncation, and connection failure. Live cloud calls require working keys, model access, and quota. Live Ollama calls require a running server and a pulled model.

Web discovery tests cover source-specific HTML extraction, unsafe-link rejection,
sample limits, deduplication, concurrent cache reuse, partial outages, stale-result
expiry, bounded downloads, redirect rejection, and access without a PAT. Live HTML
fetches were checked for both sources. Browser smoke checks cover source browsing,
text/language filtering, sorting, pagination, analysis navigation, failed refreshes,
retry, and a 390-pixel mobile viewport using mocked API responses.

Implementation references: [GitHub community metrics](https://docs.github.com/en/rest/metrics/community), [GitHub pull requests](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests), and [OpenAI text generation](https://developers.openai.com/api/docs/guides/text).

Provider references: [Ollama chat API](https://docs.ollama.com/api/chat) and [Gemini generateContent API](https://ai.google.dev/api/generate-content).

## Navigation and recovery

Repository links (including links to issues or files within a repository) open that project's analysis. Its URL is retained in `#contribute?repo=...`, so reload, browser history, and saved-project links work. Topic/language/beginner search drafts persist for the browser session when visiting Settings. Filters apply to discovery searches, not direct repository inspection.

Save/unsave buttons check bookmark status and display errors on failure. Saved cards link back to contribution analysis. Repository refresh and request retries fetch new evidence. Issue filters can be cleared together. AI configuration can be retried without reloading. Stop waiting cancels the browser's wait; it does not guarantee the AI provider stops processing or billing an already submitted request.

Flow audit covered discovery, URL parsing, saved-project navigation, save/unsave failure recovery, provider retry/switching/cancellation, browser history, issue filtering, and report setup/tracking error recovery using mocked browser API responses. Live GitHub issue search was also checked. Full database-backed application startup requires the configured PostgreSQL service.
