# Ruro — The Bible

> GitHub-native operating system for your engineering truth.  
> Automatic. Portable. Nothing leaves GitHub for the core. Not a scoreboard.

**Product name:** Ruro (GitHub OS)  
**Category:** Developer tooling / personal GitHub operating surface  
**Distribution:** Reusable Action + meta-repo (Pages web + CLI + data)  
**Owner:** sir  
**Builder:** Jarvis  

**Principle:** Claimed is not proven. Objective signals first. Copilot judgment optional.

---

## 1. Mission

People use Notion as a home for work. Ruro is the **GitHub OS** for portfolio and project truth:

> Which projects are real, alive, deployed-for-real, and worth showing — continuously, automatically.

Not a vanity table. A place you operate from (web + CLI), refreshed by Actions.

---

## 2. Non-Negotiable Constraints

| Constraint | Meaning |
|---|---|
| **GitHub-native** | Collect, score, store, render via GitHub API + Actions + repo files + Pages |
| **Core zero-AI** | Fitness + probes + scores are deterministic |
| **Deployed = verified** | Homepage must pass live probe (not github.com/repo, not parking/soft-404) |
| **Copilot optional** | Code judgment layer; never required for scores; fails soft |
| **Portable** | Point at another GitHub identity → their OS boots |
| **Authorship clean** | Commits as owner only — never Cursor / actions bot as author of truth |

---

## 3. Product Shape

| Layer | Role |
|---|---|
| **Kernel** | Collect → probe (auditable proof) → fitness → score → regressions |
| **Memory** | `data/latest.json`, `data/history/`, `data/proofs/`, `data/ai/` |
| **Desktop** | `docs/index.html` (OS home on Pages) |
| **Terminal** | `brief` / `next` / `diff` / `why` · Copilot `review` is garnish |
| **Install** | Action + `ruro.yml` owner switch |

---

## 4. Scoring Canon

```
Showability = 0.40 * Quality + 0.35 * Alive + 0.25 * Structure
```

- **Quality** — tests, CI matrix, lint, lockfile, **tree fitness**, owner commit share  
- **Alive** — push cadence, **verified demo + body hash**, releases, fresh CI  
- **Structure** — README, license, description, topics, **verified homepage only**

`LIVE` requires a **verified** deployment probe **and** a push within `active_days` (default 90). Verified but quiet sites stay ACTIVE/STALE by age — no LIVE zombies.

**Proof artifacts** (`data/proofs/`): final URL, redirect chain, HTTP status, latency, body hash, SPA shell flag, hash stability, probedAt.

**Operator commands:** `brief` (show path + regressions + next fixes), `next` (playbook), `diff` (vs previous history day).

---

## 5. Two brains

1. **Without AI** — tree fitness + auditable probes + platform signals + regressions  
2. **With Copilot** — optional `/review` judgment (never the wow; soft-fail)

---

## 6. Privacy

| Mode | Use when |
|---|---|
| `full` | Private meta-repo (recommended if scanning private repos) |
| `public_only_render` | Public meta-repo; private repos omitted from render |

---

## 7. Bar

If it looks like a scoreboard and not an OS, we failed.  
If a URL is claimed but not proven live, we failed.  
If AI moves scores, we failed.
