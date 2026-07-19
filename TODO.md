# TODO

Enhancement ideas — UI/UX and features. Not committed to any milestone; pull from this list as time allows.

## UI/UX polish

- [x] Language filter chips on Trending — clickable chips above the grid to filter by language client-side (also listed in CLAUDE.md backlog)
- [x] Rank-change indicators — show ▲/▼ next to `#rank` when SSE updates reorder the list (delta vs. previous feed ordering; layout-sliding FLIP left out — no motion lib)
- [x] Toast + undo on save — replace silent card removal with a toast ("Saved owner/name — Undo"), also surface save failures
- [x] Live "updated X ago" ticker — re-render every ~30s so the timestamp in `TrendingPage` doesn't freeze between SSE events
- [x] URL-based routing — persist the active nav view (Trending/Saved/Reports/Settings) across refresh, at least via hash routing
- [x] Empty-state guidance when no PAT is configured — detect the missing-token error and link to Settings instead of a generic error
- [x] Match skeleton count to configured feed size on initial Trending load — remembers the last feed size in `localStorage`

## Feature enhancements

- [ ] Time-window toggle for star velocity (1h / 6h / 24h) computed from snapshot history, instead of only since-last-poll delta
- [ ] Sparkline of star history per repo card, from existing snapshot data
- [ ] Notes/tags on saved repos — short freeform note field per saved repo
- [ ] "Track for reports" shortcut button on saved-repo cards, bridging saved repos and tracked repos without merging the tables
- [ ] Report preview parity with the emailed report — stale-issue flagging (e.g. open > 30 days), links to GitHub filtered views per assignee group
- [ ] New-arrival highlight — briefly highlight a card when it appears in the feed for the first time via SSE
- [ ] Expose poll interval + trending feed size in Settings UI (currently config-only)
- [ ] Keyboard navigation on Trending — j/k to move between cards, s to save, o to open

## AI empowerment (new mode)

A dedicated mode/view exposing AI-powered features. 30 candidates below, grouped by
the skill each demonstrates (resume/interview value in parentheses). Don't build all 30 —
pick a vertical slice that covers embeddings + RAG + agents + evals; that combination is
what job descriptions actually screen for.

### Flagship smart features (committed direction — build these first)

**F1. Saved-repo pulse — never miss an update on a saved repo.**
Saved repos are currently excluded from the trending feed, so the app learns nothing
about them after you save. Add a dedicated saved-repo poller + "what's new" surface.

- [ ] `saved_repo_activity` cursors per saved repo: last_seen_release_id, last_seen_commit_sha, last_seen_issue/PR number, last star count
- [ ] Background poller (reuse APScheduler) fetching releases / commits / new issues + PRs / stars per saved repo on an interval
- [ ] "New since you last looked" badges on Saved cards (releases, commits, issues, star delta) + a per-repo "mark caught up" action
- [ ] Updates tab in the Saved view: reverse-chron feed of everything new across all saved repos
- [ ] AI weekly pulse: LLM summarizes the raw activity into a short briefing ("tokio shipped 1.39 with…, axum has a breaking change in…") — reuses #3/#4 below
- [ ] Fold saved-repo pulse into the scheduled report email as an optional section

**F2. Issue → engineer matcher — for a new issue, suggest who should take it.**
For tracked repos: match each new/unassigned issue against historical closed issues and
file-ownership signals to recommend the engineer with the most relevant experience.
Read-only — the app suggests in the report/UI, it never assigns on GitHub.

- [ ] pgvector extension + `issue_index` table: repo, issue number, title/body embedding, labels, assignees, closed_by, linked-PR author, closed_at
- [ ] Backfill job: ingest closed issues per tracked repo (paginated, resumable) and embed them
- [ ] Resolver extraction: for each closed issue, record who actually fixed it (assignee, closer, and author of the linked PR via timeline events)
- [ ] Similarity search: new issue → top-k similar closed issues (cosine over pgvector)
- [ ] Ownership signal: LLM extracts likely files/areas from the issue text; map to frequent committers of those paths
- [ ] Scoring: rank engineers by similar-issues-resolved × recency × file ownership; return top 2–3 with evidence
- [ ] Report + UI integration: unassigned issues show "Suggested: alice — closed 3 similar issues (#412, #388), top committer to src/parser/"
- [ ] Eval set: hold out recently-closed issues with known resolvers, measure top-3 hit rate (this doubles as #30's eval suite)

### Summarization & generation (LLM API fundamentals, structured outputs)

- [ ] 1. Repo TL;DR — AI summary of each trending repo's README on the card (what it does, who it's for)
- [ ] 2. "Why is this trending?" explainer — combines star-velocity history + README + recent releases into a one-liner
- [ ] 3. AI narrative daily digest — rewrite the report email as a short human-style briefing instead of raw tables
- [ ] 4. Release-notes digest — summarize new releases across saved/tracked repos since the last poll
- [ ] 5. Repo comparison — select 2–3 repos, get structured compare/contrast (features, maturity, community health)
- [ ] 6. ELI5 toggle — plain-English re-explanation of any repo for non-experts
- [ ] 7. Weekly "state of the trends" report — LLM narrates language/topic shifts computed from snapshot history

### Embeddings & semantic search (pgvector — "vector DB experience")

- [ ] 8. Semantic search over trending + saved repos ("that Rust thing for terminal UIs")
- [ ] 9. "Similar repos" strip on each card via embedding cosine similarity
- [ ] 10. Personalized ranking — learn a taste vector from saved repos, re-rank the trending feed by similarity
- [ ] 11. Topic clustering — auto-group the feed into themes (cluster embeddings, LLM names each cluster)
- [ ] 12. Duplicate-issue detection in tracked repos via embedding similarity (surfaced in reports)
- [ ] 13. Auto-tagging of saved repos + smart collections built from those tags

### RAG (the single most-asked-about pattern in interviews)

- [ ] 14. "Chat with a repo" — RAG over README/docs of any trending repo, with cited sources
- [ ] 15. Issue-thread Q&A — RAG over a tracked repo's issues: "has anyone reported X before?"

### Agents & tool use (agentic workflows, function calling)

- [ ] 16. Dashboard copilot — chat assistant with tool use that calls the app's own API (search, save, track, trigger report) from natural language
- [ ] 17. Text-to-SQL analytics — questions over the snapshots table ("which Python repo gained most stars this week?") with generated read-only SQL + guardrails
- [ ] 18. Repo research agent — given a repo, agent fetches README/releases/issues and produces a structured "should I adopt this?" brief
- [ ] 19. Autonomous digest agent — scheduled agent decides what's newsworthy today instead of dumping everything

### Classification & extraction (structured outputs, prompt design)

- [ ] 20. Issue triage — auto-label issues bug/feature/question/docs in reports via LLM classification
- [ ] 21. Sentiment flagging — surface frustrated/urgent issue threads in tracked repos
- [ ] 22. Tech-stack extraction — parse repo metadata into structured stack tags (framework/infra/DB) for filtering
- [ ] 23. Stale-issue nudge drafts — AI-drafted follow-up text per stale issue (draft-only; app stays read-only toward GitHub)
- [ ] 24. Good-first-issue matcher — match beginner-friendly issues to a stored skill profile

### Classic ML on own data (shows you're not just an API caller)

- [ ] 25. Star-growth forecasting — time-series prediction from snapshot history, forecast drawn on the card sparkline
- [ ] 26. Anomaly detection on star velocity — flag suspicious spikes (bot-star patterns)

### AI engineering maturity (what actually separates candidates)

- [ ] 27. Token streaming to the UI — stream LLM responses over the existing SSE infrastructure
- [ ] 28. LLM ops panel — per-feature token usage, cost, and latency tracking; prompt caching to cut spend
- [ ] 29. Provider abstraction — Claude API primary with local Ollama fallback behind one interface
- [ ] 30. Prompt eval suite — pytest-based golden-set evals for the summarizer/classifier prompts, run in CI

Superseded by the list above (kept for history):

- [x] Decide which AI features to include → expanded into the 30 candidates above
- ~~AI-generated summaries of trending repos~~ → #1
- ~~Natural-language search over trending + saved repos~~ → #8 / #17
- ~~AI digest of open issues per tracked repo~~ → #3 / #20
- ~~"Why is this trending?" explainer per repo card~~ → #2
