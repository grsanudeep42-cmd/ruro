# Ruro — The Bible

> Self-maintaining portfolio scorecard for every repo you own.  
> GitHub Action + meta-repo. Never leaves GitHub. Zero AI. One view. All projects.

**Product name:** Ruro  
**Category:** Developer tooling / GitHub portfolio metrics (not data science, not AI)  
**Distribution:** Reusable GitHub Action + this meta-repo for config, data, and `DASHBOARD.md`  
**Status:** Canon  
**Owner:** sir  
**Builder:** Jarvis  

**Principle:** Objective signals beat vibes. Automation maintains truth.

---

## 1. Mission

You have many repos. You need one honest answer:

> Which projects are actually good, actually alive, and actually worth opening?

Ruro answers that for **every** owned repo, on a schedule, from checkable evidence — then writes a single scorecard that stays current because it regenerates itself.

---

## 2. Non-Negotiable Constraints

| Constraint | Meaning |
|---|---|
| **GitHub-only** | Collect, score, store, render via GitHub API + Actions + repo files |
| **No AI** | Heuristics + static/platform signals only. Deterministic |
| **All projects** | Every non-excluded owned repo is scored |
| **One view** | Single `DASHBOARD.md` — no multi-audience UIs |
| **Self-maintaining** | Scheduled Action updates the picture |
| **Safe by construction** | Metadata + GitHub-hosted runners; no SaaS exfiltration |

---

## 3. Product Shape

| Layer | Role |
|---|---|
| **GitHub Action (`action.yml`)** | Versioned engine: collect → probe → score → render |
| **Meta-repo (`ruro`)** | Owns `ruro.yml`, `data/`, `DASHBOARD.md`, workflows |

This is a **scorecard product**, not a bland vanity dashboard and not a one-shot audit.

---

## 4. Scoring Canon

```
Showability = 0.40 * Quality + 0.35 * Alive + 0.25 * Structure
```

- **Quality** — tests, CI, lint, Dependabot, lockfile, stub penalties  
- **Alive** — push recency, cadence, demo UP/DOWN, releases, fresh CI  
- **Structure** — README substance, license, description, topics, homepage  

Every score exposes `drivers` and `blockers`. No unexplained points.

Statuses: `LIVE` | `ACTIVE` | `STALE` | `DORMANT` | `DEAD` | `ARCHIVED`

---

## 5. Privacy

| Mode | Use when |
|---|---|
| `full` | Private meta-repo (recommended if scanning private repos) |
| `public_only_render` | Public meta-repo; private repos scored internally but omitted from render |

---

## 6. Roadmap

- **Done:** Phase 1 — API collectors, demo probes, deterministic scorer, one-view dashboard, CI, Action, dist bundle  
- **Done:** Phase 2a — richer quality detectors (manifest/test-script/layout signals), authorship guard script  
- **Next:** history transition chips, Marketplace release packaging, optional GitHub App auth, language packs depth  
- **Never:** LLM judging, third-party code upload, star-primary ranking, Cursor/bot commit attribution on GitHub  

---

## 7. Name

**Ruro** — short, ownable product name. Tagline: *Portfolio scorecard for GitHub.*

---

When in doubt: ship ruthlessly, keep scores boring and true.
