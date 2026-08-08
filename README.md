# Ruro

**GitHub OS** for your engineering truth — automatic, portable, GitHub-native.  
Not a scoreboard. A living operating surface (Pages + CLI) that proves what is alive, deployed, and worth showing.

Core is **zero AI**. Copilot is optional judgment. Deployed means **verified by probe**.

## Surfaces

| Surface | What |
| --- | --- |
| **Web OS** | `docs/index.html` — Attention, verified deploys, showables, fleet |
| **CLI** | `ruro view` / `top` / `status` / `review` |
| **Memory** | `data/latest.json` + history + optional `data/ai/` |

## Quick start

1. Set `owner` in `ruro.yml`.
2. Secret **`RURO_TOKEN`** (classic PAT, `repo` scope).
3. Run **Actions → Ruro Scorecard**.
4. Pages: **Settings → Pages → branch `main` → `/docs`**.

```bash
npm ci && npm test && npm run build
GITHUB_TOKEN=$(gh auth token) npm run ruro -- scan
npm run ruro -- view
GITHUB_TOKEN=$(gh auth token) npm run ruro -- review aryanbloodbank
```

## Score model

```
Showability = 0.40*Quality + 0.35*Alive + 0.25*Structure
```

`LIVE` only if deployment probe is **verified** (not github.com/repo, not parking pages).

## License

MIT
