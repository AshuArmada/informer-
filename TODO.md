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

A dedicated mode/view exposing AI-powered features. Specific features TBD.

- [ ] Decide which AI features to include (candidates below)
- [ ] AI-generated summaries of trending repos (what it does / why it's spiking)
- [ ] Natural-language search over trending + saved repos
- [ ] AI digest of open issues per tracked repo (themes, priorities) in reports
- [ ] "Why is this trending?" explainer per repo card
