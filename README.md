# Ruro

**Production-grade GitHub portfolio scorecard.**  
Zero AI. Deterministic. Runs entirely on GitHub Actions. One view. Every repo ranked.

> Which of my projects are actually good, actually alive, and actually worth opening?

Ruro answers that with checkable signals — commit recency, demo URL health, tests/CI/lint presence, README/license structure — then writes a living `DASHBOARD.md` that refreshes itself.

## Not data science

Ruro is **developer tooling / software portfolio metrics**, not ML or data science. No models. Same inputs ⇒ same scores.

## Quick start

1. Use this repo (or copy the Action into your meta-repo).
2. Copy `ruro.yml` and set `owner: YOUR_LOGIN`.
3. Add a fine-grained PAT as `RURO_TOKEN` (repo read across your account; contents write is via `GITHUB_TOKEN` on this repo).
4. Run **Actions → Ruro Scorecard → Run workflow**.

```yaml
- uses: grsanudeep42-cmd/ruro@v0.1.0
  with:
    token: ${{ secrets.RURO_TOKEN }}
    config-path: ruro.yml
```

## Local

```bash
npm ci
npm test
npm run build
GITHUB_TOKEN=$(gh auth token) npm run ruro -- --config ruro.yml
```

## Score model

```
Showability = 0.40*Quality + 0.35*Alive + 0.25*Structure
```

Statuses: `LIVE` · `ACTIVE` · `STALE` · `DORMANT` · `DEAD` · `ARCHIVED`

See [BIBLE.md](./BIBLE.md) for the full product canon.

## Safety

- No third-party SaaS reads your code
- No AI / no code leaving GitHub
- Prefer a **private** meta-repo if you scan private projects
- Probes only hit declared homepage URLs

## License

MIT
