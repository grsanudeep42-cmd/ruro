# Ruro

**Portfolio Jarvis for GitHub.**  
Which of your projects are alive, good, and worth showing — answered with checkable signals, not vibes.

Core is **zero AI** (deterministic). Optional Copilot annotations are Phase 2 and off by default.

## Surfaces

| Surface | What |
| --- | --- |
| **Web** | `docs/index.html` — recruiter-facing ranked portfolio (GitHub Pages) |
| **CLI** | `ruro view` / `top` / `status` — daily offline read of `data/latest.json` |
| **Markdown** | `DASHBOARD.md` + SVG card for README embeds |

## Quick start

1. Fork/use this meta-repo; set `owner` in `ruro.yml`.
2. Create a classic PAT with `repo` scope → repo secret **`RURO_TOKEN`**.
3. Run **Actions → Ruro Scorecard → Run workflow**.
4. Enable Pages: **Settings → Pages → Deploy from branch → `main` / `/docs`**.

Public URL (this repo): `https://grsanudeep42-cmd.github.io/ruro/`

```yaml
- uses: grsanudeep42-cmd/ruro@v0.1.0
  with:
    token: ${{ secrets.RURO_TOKEN }}
    config-path: ruro.yml
    sync-profile: "false"
```

Scorecard commits as **you** via `RURO_TOKEN` — never `github-actions[bot]`. Profile README sync stays off until you turn `profile.enabled` on.

## Local

```bash
npm ci && npm test && npm run build
GITHUB_TOKEN=$(gh auth token) npm run ruro -- scan --config ruro.yml

# Offline after a scan:
npm run ruro -- view
npm run ruro -- top 5
npm run ruro -- status my-repo
```

## Score model

```
Showability = 0.40*Quality + 0.35*Alive + 0.25*Structure
```

Statuses: `LIVE` · `ACTIVE` · `STALE` · `DORMANT` · `DEAD` · `ARCHIVED`

See [BIBLE.md](./BIBLE.md) for the full product canon.

## Optional AI (Phase 2)

In `ruro.yml`:

```yaml
ai:
  enabled: false
  provider: none   # set to copilot when ready
  top_n: 5
  cache_dir: data/ai
```

When enabled, Ruro may write short narratives under `data/ai/`. Scores never depend on AI; missing Copilot/credits fails soft.

## Safety

- No third-party SaaS reads your code for scoring
- Prefer a **private** meta-repo if you scan private projects
- Probes only hit declared homepage URLs

## License

MIT
