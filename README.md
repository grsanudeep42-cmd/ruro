<div align="center">

# Ruro

**GitHub OS** — automatic truth for every repo you own.

<a href="https://grsanudeep42-cmd.github.io/ruro/">
  <img src="./assets/ruro-card.svg" width="600" alt="Ruro CLI terminal overview" />
</a>

[Overview](./OVERVIEW.md) · [License](./LICENSE) · [Pages OS](https://grsanudeep42-cmd.github.io/ruro/) · [Dashboard](./DASHBOARD.md)

</div>

---

## CLI

```bash
git clone https://github.com/grsanudeep42-cmd/ruro.git
cd ruro && npm ci && npm run build
GITHUB_TOKEN=$(gh auth token) npm run ruro -- scan
npm run ruro -- view
npm run ruro -- top 5
npm run ruro -- status phantom
GITHUB_TOKEN=$(gh auth token) npm run ruro -- review aryanbloodbank
```

Point `owner` in [`ruro.yml`](./ruro.yml) at any GitHub login → their fleet boots.

## What it is

| Surface | Path |
| --- | --- |
| **Overview** | [`OVERVIEW.md`](./OVERVIEW.md) — living fleet snapshot (like README, auto-refreshed) |
| **CLI** | `ruro view` / `top` / `status` / `review` |
| **Pages OS** | [`docs/`](./docs/) → https://grsanudeep42-cmd.github.io/ruro/ |
| **License** | [`LICENSE`](./LICENSE) — MIT |
| **Kernel** | Actions + deploy probes + tree fitness + optional Copilot |

Deployed means **verified**. SPA shells count. Parking pages and `github.com/repo` links do not. Copilot never moves scores.

## Setup

1. Set `owner` in `ruro.yml`
2. Secret `RURO_TOKEN` (classic PAT, `repo`)
3. Actions → Ruro Scorecard
4. Pages → `main` / `/docs`

Commits stay under **your** account via `RURO_TOKEN` — never `github-actions[bot]`.

## License

MIT — see [LICENSE](./LICENSE).
