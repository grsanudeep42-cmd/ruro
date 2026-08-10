<div align="center">

# Ruro

**GitHub OS** — prove which projects are real, alive, and verified-deployed. Then operate them.

Deterministic scores. Operator briefings. Live CLI with Ruri. Optional Copilot garnish.

<img src="./assets/ruro-card.svg" width="640" alt="Ruro — fleet operator card" />

[BIBLE](./BIBLE.md) · [MIT](./LICENSE) · [Example Pages](https://grsanudeep42-cmd.github.io/ruro/)

</div>

---

## What this is

Ruro is an open-source **personal GitHub operating system**. Point it at any GitHub user or org you can access — it becomes **their** fleet OS.

1. **Collect** truth from GitHub (repos, tree, CI, cadence)
2. **Probe** homepages for real deploys (HTTP proof, body hash, SPA detection)
3. **Score** showability with named contributions — same inputs ⇒ same scores
4. **Operate** from a live terminal (Ruri) or one-shot commands

It is **not** a vanity leaderboard and **not** “AI ranked my GitHub.”  
Copilot review is optional commentary and **never** moves scores.

| Layer | What you get |
| --- | --- |
| **Kernel** | Scan → probe → fitness → score → regressions |
| **Memory** | `data/latest.json`, `data/history/`, `data/proofs/` |
| **Terminal** | Live REPL + `brief` / `next` / `diff` / `why` / `status` |
| **Desktop** | GitHub Pages OS at `docs/` |
| **Automation** | Scheduled Action that refreshes the scorecard |

---

## Quick start

**Requirements:** Node.js **≥ 20**, npm, a GitHub token.

```bash
git clone https://github.com/grsanudeep42-cmd/ruro.git
cd ruro
npm ci

cp ruro.example.yml ruro.yml
# edit ruro.yml → set owner: YOUR_GITHUB_LOGIN

export GITHUB_TOKEN=ghp_…   # or GH_TOKEN
npm run ruro -- scan
npm run ruro
```

You’re in a live session on **your** fleet. Type `/` for the command menu.

```text
› /                 # slash menu (filters as you type)
› brief             # show path + regressions + next fixes
› why <repo>        # score math + playbook
› status <repo>     # dossier + deploy proof
› /br               # unique prefix → runs /brief
› /exit
```

**Privacy:** Ruro runs locally with **your** token. It cannot read other people’s private repos. Public GitHub data is public (same as github.com). For private fleets, use a **private** meta-repo — see [Private repos](#private-repos).

---

## Two ways to run commands

### 1. Live session (recommended)

```bash
npm run ruro
# aliases: npm run ruro -- live | repl | shell
```

| Input | Behavior |
| --- | --- |
| `/` | Open / filter the slash menu |
| `/br`, `/st` … | Unique prefix runs that command |
| `brief`, `next`, `diff` | Natural language also works |
| `<repo>` | Bare repo name → short status |
| `Esc` | Clear the slash menu |
| Tab | Complete commands / repo names |

### 2. One-shot CLI

```bash
npm run ruro -- brief
npm run ruro -- next
npm run ruro -- diff
npm run ruro -- view
npm run ruro -- top 10
npm run ruro -- status <repo>
npm run ruro -- full <repo>
npm run ruro -- why <repo>
npm run ruro -- help
```

### Machine-readable JSON

```bash
npm run build
node dist/cli.js --json view
node dist/cli.js --json brief
node dist/cli.js --json why <repo>
```

Or: `npm run --silent ruro -- --json view`

---

## Command reference

### Operator surfaces

| Command | What it does |
| --- | --- |
| `brief` | Operator briefing — top show path, regressions, next fixes |
| `next` | Highest-leverage blockers with concrete playbook steps |
| `diff` | Fleet changes vs previous history day |

### Fleet & dossiers

| Command | What it does |
| --- | --- |
| `view` | Ranked fleet shortlist |
| `top [n]` | Top *n* by showability (default 5) |
| `status <repo>` | Short dossier + auditable deploy proof |
| `full <repo>` | Long dossier (drivers, blockers, tree, langs) |
| `why <repo>` | Contribution math, biggest movers, playbook |

### Refresh & judgment

| Command | Needs | What it does |
| --- | --- | --- |
| `scan` | `GITHUB_TOKEN` or `GH_TOKEN` | Refresh GitHub truth, probes, proofs, scores |
| `review [repo]` | Token + Copilot CLI | Optional code judgment — **never** moves scores |

### Session

| Command | What it does |
| --- | --- |
| `help` / `/help` | Show help / slash menu |
| `reload` | Reload `data/latest.json` from disk |
| `clear` | Clear screen, redraw Ruri boot |
| `exit` / `/exit` | Leave the live session |

---

## How scoring works

```text
Showability = 0.40 × Quality + 0.35 × Alive + 0.25 × Structure
```

Weights live in `ruro.yml` (from [`ruro.example.yml`](./ruro.example.yml)).

| Pillar | Weight | Signals (examples) |
| --- | --- | --- |
| **Quality** | 40% | Tests, CI / workflow matrix, lint, lockfile, tree fitness, owner commit share |
| **Alive** | 35% | Push cadence, **verified deploy**, releases, fresh CI |
| **Structure** | 25% | README, license, description, topics, homepage verified |

Not deploy-only: a strong codebase can score well without a live demo.  
**LIVE** status is stricter: verified deploy **and** push within `active_days`.

| Status | Meaning |
| --- | --- |
| **LIVE** | Verified deploy **and** recent push |
| **ACTIVE** | Recent push, deploy not verified (or none) |
| **STALE** / **DORMANT** / **ARCHIVED** | Age / archive rules from config thresholds |

**Deployed ≠ “has a homepage URL.”**  
Ruro probes the URL: HTTP proof, body bytes, hash, redirect chain, SPA shell detection. Proofs land under `data/proofs/`.

Every score point has a **named contribution** — `why <repo>` explains the math.

---

## Configuration

```bash
cp ruro.example.yml ruro.yml
```

Minimum edit:

```yaml
owner: YOUR_GITHUB_LOGIN   # required — your login or org
```

Useful knobs:

```yaml
scan:
  include_private: false
  include_forks: false
  include_archived: true
  exclude_repos:
    - ruro
    - ".github"

privacy:
  mode: public_only_render   # or full on a PRIVATE meta-repo

thresholds:
  active_days: 90
```

Placeholder owners (`YOUR_GITHUB_LOGIN`, etc.) are rejected so you always configure a real target.

### Private repos

| Goal | Config |
| --- | --- |
| Public Pages / public meta-repo | `include_private: false` + `privacy.mode: public_only_render` |
| Full private fleet | `include_private: true` + `privacy.mode: full` + `repo`-scoped token on a **private** meta-repo |

```yaml
scan:
  include_private: true
privacy:
  mode: full
```

### Optional Copilot review

Scores never depend on this.

```bash
npm run ruro -- review <repo>
# or in the live session:
› /review <repo>
```

Judgment caches under `data/ai/`.

---

## Automate on GitHub Actions

Workflow: [`.github/workflows/ruro.yml`](./.github/workflows/ruro.yml)

1. Fork or use this repo as your meta-repo  
2. `cp ruro.example.yml ruro.yml` and set `owner`  
3. Secret **`RURO_TOKEN`** (PAT that can push as **you**, not `github-actions[bot]`)  
4. Set the workflow commit author to **your** name/email  
5. **Actions → Ruro Scorecard → Run workflow**  
6. Optional: Pages from `main` / `/docs`  

Toolchain CI: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

---

## Project layout

```text
ruro/
├── src/                 # CLI, collect, probe, score, render
├── data/                # scorecard, history, proofs (after scan)
├── docs/                # Pages “desktop” (after scan)
├── ruro.example.yml     # copy → ruro.yml
├── ruro.yml             # your config (create from example)
├── BIBLE.md             # product canon
└── LICENSE              # MIT
```

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run ruro` | Live operator (Ruri) |
| `npm run ruro -- <cmd>` | One-shot command |
| `npm run build` | Emit `dist/cli.js` + `dist/index.js` |
| `npm test` | Vitest suite |
| `npm run typecheck` | `tsc --noEmit` |

Binary after build: `node dist/cli.js` (package bin `ruro`).

---

## FAQ

**Whose GitHub does it score?**  
Whoever you set as `owner` in `ruro.yml`, using **your** token. Configure once → scan → it’s that account’s OS.

**Can it see other people’s private repos?**  
No. Only what your token can already access.

**Is Copilot required?**  
No. Core path is zero-AI. Review is garnish.

**Will scores match if I re-scan?**  
Yes for the deterministic core (same GitHub + probe inputs ⇒ same scores). Live probe latency/hash can change if the site changed.

[![Marketplace](https://img.shields.io/badge/Marketplace-Ruro-blue?logo=github)](https://github.com/marketplace/actions/ruro-portfolio-scorecard)


**License?**  
MIT — use it, fork it, run it on any account you control.

---

## License

MIT — see [LICENSE](./LICENSE).
