<div align="center">

# Ruro

**GitHub OS CLI** — deterministic fleet truth + optional Copilot code audit.

<a href="./OVERVIEW.md"><img src="./assets/ruro-card.svg" width="600" alt="Ruro CLI terminal" /></a>

[OVERVIEW.md](./OVERVIEW.md) · [LICENSE](./LICENSE) · [Pages](https://grsanudeep42-cmd.github.io/ruro/) · [BIBLE.md](./BIBLE.md)

</div>

---

## Correct way to use it

**Live session (this is the product):**

```bash
cd ruro && npm ci && npm run build
npm run ruro
```

```text
› view
› aryanbloodbank
› why phantom
› review aryanbloodbank
› scan
› /exit
```

Agent-style session: Ruri answers in prose (not box tables). Stays open until `/exit`.

**One-shot** (scripts/CI) still works: `npm run ruro -- view`, `npm run ruro -- why <repo>`, etc.

| Command | What |
| --- | --- |
| *(no args)* / `repl` | Live session |
| `scan` | Refresh truth (needs token) |
| `view` / `top` / `status` / `why` | Inspect fleet |
| `review` | Copilot audit (embedded dossier; never moves scores) |

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
