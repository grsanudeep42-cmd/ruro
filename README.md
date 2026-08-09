<div align="center">

# Ruro

**GitHub OS CLI** — deterministic fleet truth + optional Copilot code audit.

<a href="./OVERVIEW.md"><img src="./assets/ruro-card.svg" width="600" alt="Ruro CLI terminal" /></a>

[OVERVIEW.md](./OVERVIEW.md) · [LICENSE](./LICENSE) · [Pages](https://grsanudeep42-cmd.github.io/ruro/) · [BIBLE.md](./BIBLE.md)

</div>

---

## Correct way to use it

```bash
git clone https://github.com/grsanudeep42-cmd/ruro.git
cd ruro && npm ci && npm run build

# 1) refresh truth (needs token)
GITHUB_TOKEN=$(gh auth token) npm run ruro -- scan

# 2) look around offline from data/latest.json
npm run ruro -- view
npm run ruro -- top 5
npm run ruro -- status aryanbloodbank
npm run ruro -- why aryanbloodbank

# 3) optional: Copilot reads a clone and writes data/ai/ (never changes scores)
GITHUB_TOKEN=$(gh auth token) npm run ruro -- review aryanbloodbank
```

| Command | What you get |
| --- | --- |
| `scan` | GitHub signals + **verified** deploy probes + tree fitness → `data/`, `docs/`, `OVERVIEW.md` |
| `view` | Full fleet table (status, score, fitness, deploy) |
| `status` | Full dossier: probe proof, fitness, platform signals, explained drivers/blockers + cached audit |
| `why` | Exact score math + plain-English meaning of every driver/blocker |
| `review` | Copilot audit that must cite real files (soft-fail; scores untouched) |

Point `owner` in [`ruro.yml`](./ruro.yml) at any GitHub login to boot **their** fleet.

## What is true vs vibes

- **Scores are signal-based** (quality / alive / structure). Same inputs ⇒ same scores.
- **LIVE** only if deploy probe is **verified** (SPA shells count; `github.com/owner/repo` does not).
- **Fitness** is without-AI tree analysis (source/test file counts) — not “code beauty.”
- **Copilot** is optional judgment. If it cannot cite real paths, the audit is rejected.
- Some old cards lied (empty SPA marked parked). That is fixed — re-`scan` after upgrades.

## Setup (Actions)

1. `owner` in `ruro.yml`
2. Repo secret `RURO_TOKEN` (classic PAT, `repo`)
3. Actions → Ruro Scorecard
4. Pages → branch `main` → `/docs`

Authorship: commits as you via `RURO_TOKEN`, not `github-actions[bot]`.

## Repo surfaces

| File | Role |
| --- | --- |
| `README.md` | This page |
| `OVERVIEW.md` | Living fleet snapshot (auto) |
| `LICENSE` | MIT |
| `docs/` | Pages OS |
| `data/latest.json` | Memory |
| `data/ai/` | Copilot audits |

## License

MIT — see [LICENSE](./LICENSE).
