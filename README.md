<div align="center">

# Ruro

**GitHub OS** — prove which projects are real, alive, and verified-deployed. Then operate them.

Deterministic core. Operator briefings. Optional Copilot garnish.

<a href="./OVERVIEW.md"><img src="./assets/ruro-card.svg" width="600" alt="Ruro CLI terminal" /></a>

[OVERVIEW.md](./OVERVIEW.md) · [BIBLE.md](./BIBLE.md) · [Pages](https://grsanudeep42-cmd.github.io/ruro/) · [LICENSE](./LICENSE)

</div>

---

## 20-second demo

```bash
git clone https://github.com/grsanudeep42-cmd/ruro.git
cd ruro && npm ci
npm run ruro
```

```text
› brief          # show path + regressions + next fixes
› why phantom    # contribution math + playbook
› aryanbloodbank # dossier + deploy proof (hash / SPA)
› diff           # vs previous history day
› /exit
```

**Scripts:**

```bash
npm run ruro -- brief
npm run ruro -- --json why phantom
```

| Command | What |
| --- | --- |
| `brief` / `next` / `diff` | Operator surfaces (demo these) |
| `view` / `status` / `why` | Fleet + proof + score math |
| `scan` | Refresh truth (needs token) |
| `review` | Optional Copilot judgment — never moves scores |
| `--json` | Machine output |

Point `owner` in [`ruro.yml`](./ruro.yml) at any GitHub login.

## Truth vs vibes

- Scores = named contributions (same inputs ⇒ same scores)
- **LIVE** = verified deploy **and** push within `active_days`
- Deploy proof stores body hash, SPA flag, redirect chain under `data/proofs/`
- Fitness / CI matrix / owner commit share = tree + Actions signals
- Copilot is optional commentary

## Actions

1. `owner` in `ruro.yml`
2. Secret `RURO_TOKEN`
3. Actions → Ruro Scorecard
4. Pages → `main` → `/docs`

## License

MIT — see [LICENSE](./LICENSE).
