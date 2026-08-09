<div align="center">

# Ruro

**GitHub OS** — prove which projects are real, alive, and verified-deployed.

Deterministic core. Optional Copilot judgment. Agent CLI + Pages desktop.

<a href="./OVERVIEW.md"><img src="./assets/ruro-card.svg" width="600" alt="Ruro CLI terminal" /></a>

[OVERVIEW.md](./OVERVIEW.md) · [BIBLE.md](./BIBLE.md) · [Pages](https://grsanudeep42-cmd.github.io/ruro/) · [LICENSE](./LICENSE)

</div>

---

## 30-second start

```bash
git clone https://github.com/grsanudeep42-cmd/ruro.git
cd ruro && npm ci
# edit owner in ruro.yml if needed
npm run ruro
```

```text
────────────────────────────────────────────────────────
        .--.
       |o_o |       RURI
       |:_/ |       ruro fleet operator
…
  RURO v0.2.0  ▸ live
────────────────────────────────────────────────────────
● ruri ·
› view
› aryanbloodbank
› why phantom
› /exit
```

**One-shot / scripts:**

```bash
npm run ruro -- view
npm run ruro -- --json why phantom
npm run ruro -- status aryanbloodbank
```

| Command | What |
| --- | --- |
| *(no args)* | Live agent session |
| `scan` | Refresh truth (needs `GITHUB_TOKEN`) |
| `view` / `top` / `status` / `why` | Inspect fleet |
| `review` | Copilot audit (never moves scores) |
| `--json` | Machine output |

Point `owner` in [`ruro.yml`](./ruro.yml) at any GitHub login to boot **their** fleet.

Profile README sync is **off by default** (`profile.enabled: false`).

## Truth vs vibes

- Scores = quality / alive / structure from **named contributions** (same inputs ⇒ same scores).
- **LIVE** = verified deploy **and** push within `active_days` (default 90). No LIVE zombies.
- Fitness = tree signals (source/test paths) — not “code beauty.”
- Copilot is optional judgment; rejected without real path citations.

## Actions setup

1. `owner` in `ruro.yml`
2. Repo secret `RURO_TOKEN` (classic PAT, `repo`)
3. Actions → Ruro Scorecard
4. Pages → branch `main` → `/docs`

Commits as you via `RURO_TOKEN`, not `github-actions[bot]`.

## License

MIT — see [LICENSE](./LICENSE).
