<div align="center">

# Ruro

**GitHub OS** — prove which projects are real, alive, and verified-deployed. Then operate them.

Deterministic scores. Operator briefings. Live CLI with Ruri. Optional Copilot garnish.

<a href="https://grsanudeep42-cmd.github.io/ruro/"><img src="./assets/ruro-card.svg" width="640" alt="Ruro — fleet operator card" /></a>

[Live OS (Pages)](https://grsanudeep42-cmd.github.io/ruro/) · [OVERVIEW](./OVERVIEW.md) · [BIBLE](./BIBLE.md) · [MIT](./LICENSE)

</div>

---

## What this is

Ruro is a **personal GitHub operating system** for your repos:

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

## Quick start (try it in 60 seconds)

**Requirements:** Node.js **≥ 20**, npm.

```bash
git clone https://github.com/grsanudeep42-cmd/ruro.git
cd ruro
npm ci
npm run ruro
```

You’re in a live session. Type `/` for the command menu.

```text
› /                 # Cursor-style slash menu (filters as you type)
› brief             # show path + regressions + next fixes
› why phantom       # score math + playbook
› status aryanbloodbank
› /br               # unique prefix → runs /brief
› /exit
```

No token needed to explore the **committed** scorecard in this repo.  
To score **your** GitHub account, see [Make it yours](#make-it-yours).

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
| `phantom` | Bare repo name → short status |
| `Esc` | Clear the slash menu |
| Tab | Complete commands / repo names |

### 2. One-shot CLI

```bash
npm run ruro -- brief
npm run ruro -- next
npm run ruro -- diff
npm run ruro -- view
npm run ruro -- top 10
npm run ruro -- status phantom
npm run ruro -- full phantom
npm run ruro -- why phantom
npm run ruro -- help
```

### Machine-readable JSON

Build once, then pipe clean JSON (avoids `npm run` banner noise):

```bash
npm run build
node dist/cli.js --json view
node dist/cli.js --json brief
node dist/cli.js --json why phantom
node dist/cli.js --json status aryanbloodbank
```

Or: `npm run --silent ruro -- --json view`

---

## Command reference

### Operator surfaces (the “wow”)

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

Weights live in [`ruro.yml`](./ruro.yml).

| Pillar | Signals (examples) |
| --- | --- |
| **Quality** | Tests, CI / workflow matrix, lint, lockfile, tree fitness, owner commit share |
| **Alive** | Push cadence, **verified deploy**, releases, fresh CI |
| **Structure** | README, license, description, topics, real homepage |

**Status meaning**

| Status | Meaning |
| --- | --- |
| **LIVE** | Verified deploy **and** push within `active_days` |
| **ACTIVE** | Recent push, deploy not verified (or none) |
| **STALE** / **DORMANT** / **ARCHIVED** | Age / archive rules from config thresholds |

**Deployed ≠ “has a homepage URL.”**  
Ruro probes the URL: HTTP proof, body bytes, hash, redirect chain, SPA shell detection. Proof artifacts land under `data/proofs/`.

Every score point has a **named contribution** — `why <repo>` explains the math.

---

## Make it yours

Point Ruro at **any** GitHub user or org.

### 1. Configure

Edit [`ruro.yml`](./ruro.yml):

```yaml
owner: YOUR_GITHUB_LOGIN   # required

scan:
  include_private: false   # true only if your token can see privates
  include_forks: false
  include_archived: true
  exclude_repos:
    - ruro
    - ".github"

thresholds:
  active_days: 90
```

### 2. Token

Create a classic or fine-grained PAT with at least:

- `repo` (or public-repo read) for the accounts you scan  
- `workflow` / Actions read if you want CI signals  

```bash
export GITHUB_TOKEN=ghp_…   # or GH_TOKEN
npm run ruro -- scan
```

After a successful scan you’ll have fresh:

- `data/latest.json` — scorecard  
- `data/history/YYYY-MM-DD.json` — day memory  
- `data/proofs/` — deploy proof blobs  
- `DASHBOARD.md` / `OVERVIEW.md` / `docs/index.html` — rendered surfaces  

Then open the operator again:

```bash
npm run ruro
› brief
```

### 3. Optional Copilot review

Scores never depend on this.

```bash
# requires GitHub Copilot CLI available in PATH + credits
npm run ruro -- review phantom
# or inside the live session:
› /review phantom
```

Judgment caches under `data/ai/`.

---

## Automate on GitHub Actions

This repo ships [`.github/workflows/ruro.yml`](./.github/workflows/ruro.yml) — daily scorecard refresh.

1. Fork or clone into **your** meta-repo  
2. Set `owner` in `ruro.yml`  
3. Add repository secret **`RURO_TOKEN`** (PAT that can push commits as **you**, not `github-actions[bot]`)  
4. Adjust the commit author block in the workflow to **your** name/email  
5. Run **Actions → Ruro Scorecard → Run workflow**  
6. Enable **Pages** from `main` / `/docs` for the web OS  

CI for the toolchain itself is [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) (typecheck, tests, build, JSON smoke).

---

## Project layout

```text
ruro/
├── src/                 # CLI, collect, probe, score, render
├── data/
│   ├── latest.json      # current scorecard
│   ├── history/         # daily snapshots (diff / regressions)
│   ├── proofs/          # deploy probe artifacts
│   └── ai/              # optional Copilot cache (never scores)
├── docs/                # Pages “desktop”
├── assets/              # profile / card SVG
├── ruro.yml             # owner + weights + thresholds
├── DASHBOARD.md         # full markdown scorecard
├── OVERVIEW.md          # living fleet snapshot
└── BIBLE.md             # product canon (deeper reading)
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

Binary after build: `node dist/cli.js` (also package bin `ruro`).

---

## FAQ

**Do I need a token to try Ruro?**  
No. Clone and `npm run ruro` — you operate on the scorecard already in the repo. Token is only for `scan` / `review` and for scoring **your** fleet.

**Will scores match if I re-scan?**  
Yes for the deterministic core (same GitHub + probe inputs ⇒ same scores). Live probe latency/hash can change if the site changed.

**Is Copilot required?**  
No. Core path is zero-AI. Review is garnish.

**Can someone else use my clone?**  
Yes — MIT. They should set their own `owner`, token, and (for Actions) commit identity. Public clone ≠ write access to this GitHub repo.

**Why did `status` need a loader normalize?**  
Older scorecards may omit newer fields (`ciConclusions`, etc.). The CLI fills safe defaults so dossiers never crash.

---

## Docs map

| Doc | Role |
| --- | --- |
| [README.md](./README.md) | You are here — product + how to run |
| [OVERVIEW.md](./OVERVIEW.md) | Current fleet snapshot |
| [BIBLE.md](./BIBLE.md) | Canon: mission, constraints, scoring |
| [DASHBOARD.md](./DASHBOARD.md) | Full scorecard tables |
| [Pages](https://grsanudeep42-cmd.github.io/ruro/) | Web OS |

---

## License

MIT — see [LICENSE](./LICENSE).
