# Ruro

**GitHub OS** you run from the terminal — and show on Pages.

```bash
git clone https://github.com/grsanudeep42-cmd/ruro.git
cd ruro && npm ci && npm run build
GITHUB_TOKEN=$(gh auth token) npm run ruro -- scan
npm run ruro -- view
npm run ruro -- top 5
npm run ruro -- status phantom
GITHUB_TOKEN=$(gh auth token) npm run ruro -- review aryanbloodbank
```

Point `owner` in `ruro.yml` at any GitHub login → their fleet boots.

## What it is

Not a vanity board. An operating surface for engineering truth:

- **CLI** — daily driver (`view` / `top` / `status` / `review`)
- **Pages OS** — https://grsanudeep42-cmd.github.io/ruro/
- **Kernel** — Actions cron + hardened deploy probes + without-AI tree fitness
- **Judgment** — optional Copilot that must read real source (never moves scores)

Deployed means **verified**. SPA shells count. Parking pages and github.com/repo links do not.

## Setup

1. Copy/use this repo · set `owner` in `ruro.yml`
2. Secret `RURO_TOKEN` (classic PAT, `repo`)
3. Actions → Ruro Scorecard
4. Pages → `main` / `/docs`

Commits stay under **your** account via `RURO_TOKEN` — never `github-actions[bot]`.

## Profile trailer

`PROFILE_SNIPPET.md` + `assets/ruro-card.svg` are a fake terminal for your profile README (GitHub cannot host a real shell there). Paste the snippet into `username/username` when you want the trailer.

## License

MIT
