import type { RuroConfig } from "../config.js";
import type { RuroReport, ScoredRepo } from "../types.js";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusClass(status: string): string {
  return `st-${status.toLowerCase()}`;
}

function row(repo: ScoredRepo, rank: number): string {
  const lang = repo.signals.primaryLanguage ?? "—";
  const demo = repo.signals.demo.status;
  const notes = [...repo.drivers.slice(0, 2), ...repo.blockers.slice(0, 1)].join(", ");
  return `<tr>
  <td class="rank">${rank}</td>
  <td class="name"><a href="${esc(repo.signals.url)}" target="_blank" rel="noreferrer">${esc(repo.signals.name)}</a></td>
  <td><span class="pill ${statusClass(repo.status)}">${esc(repo.status)}</span></td>
  <td class="score"><strong>${repo.score}</strong></td>
  <td>${repo.pillars.quality}</td>
  <td>${repo.pillars.alive}</td>
  <td>${repo.pillars.structure}</td>
  <td><span class="pill demo-${demo.toLowerCase()}">${esc(demo)}</span></td>
  <td>${esc(lang)}</td>
  <td class="notes">${esc(notes || "—")}</td>
</tr>`;
}

export function renderWebDashboard(
  report: RuroReport,
  config: RuroConfig,
): string {
  const top = report.repos.slice(0, 3);
  const topHtml = top
    .map(
      (r, i) => `<article class="top-card">
  <div class="top-rank">0${i + 1}</div>
  <h2><a href="${esc(r.signals.url)}" target="_blank" rel="noreferrer">${esc(r.signals.name)}</a></h2>
  <p><span class="pill ${statusClass(r.status)}">${esc(r.status)}</span> <span class="score-lg">${r.score}</span></p>
  <p class="muted">${esc(r.drivers.slice(0, 3).join(" · ") || "—")}</p>
</article>`,
    )
    .join("\n");

  const rows = report.repos.map((r, i) => row(r, i + 1)).join("\n");
  const mix = Object.entries(report.status_counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join(" · ");

  const transitions =
    report.transitions.length === 0
      ? `<p class="muted">No status changes since the previous run.</p>`
      : `<ul class="transitions">${report.transitions
          .map(
            (t) =>
              `<li><a href="${esc(t.url)}">${esc(t.name)}</a>: <code>${esc(t.from)}</code> → <code>${esc(t.to)}</code> (${t.scoreFrom} → ${t.scoreTo})</li>`,
          )
          .join("")}</ul>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(config.render.title)}</title>
  <style>
    :root {
      --bg: #07090d;
      --panel: #0f141c;
      --line: #1f2937;
      --text: #f8fafc;
      --muted: #94a3b8;
      --lime: #b6ff3b;
      --sky: #7dd3fc;
      --amber: #fbbf24;
      --orange: #fb923c;
      --red: #f87171;
      --slate: #94a3b8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background:
        radial-gradient(1200px 500px at 10% -10%, #122018 0%, transparent 55%),
        var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 40px 20px 80px; }
    .eyebrow { color: var(--lime); letter-spacing: 0.18em; font-size: 12px; margin: 0 0 10px; }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 4vw, 40px); font-weight: 600; }
    .sub { color: var(--muted); margin: 0 0 28px; line-height: 1.5; }
    .stats {
      display: flex; flex-wrap: wrap; gap: 10px 18px;
      padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px;
      background: rgba(15,20,28,0.85); margin-bottom: 28px;
    }
    .stats span { color: var(--muted); font-size: 12px; }
    .stats strong { color: var(--text); }
    .tops { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
    @media (max-width: 860px) { .tops { grid-template-columns: 1fr; } }
    .top-card {
      background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
      padding: 18px; min-height: 140px;
    }
    .top-rank { color: var(--lime); font-size: 12px; letter-spacing: 0.12em; margin-bottom: 8px; }
    .top-card h2 { margin: 0 0 10px; font-size: 18px; }
    .top-card a { color: var(--text); text-decoration: none; }
    .top-card a:hover { color: var(--lime); }
    .score-lg { color: var(--lime); font-size: 20px; margin-left: 8px; }
    .muted { color: var(--muted); font-size: 12px; }
    h3 { margin: 0 0 12px; font-size: 14px; letter-spacing: 0.08em; color: var(--muted); text-transform: uppercase; }
    .panel {
      background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
      padding: 18px; margin-bottom: 22px; overflow: auto;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #17202b; vertical-align: top; }
    th { color: var(--muted); font-weight: 500; white-space: nowrap; }
    td.rank, td.score { font-variant-numeric: tabular-nums; }
    td.name a { color: var(--text); text-decoration: none; }
    td.name a:hover { color: var(--lime); }
    td.notes { color: var(--muted); max-width: 220px; }
    .pill {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      border: 1px solid var(--line); font-size: 11px;
    }
    .st-live { color: #052e16; background: var(--lime); border-color: transparent; }
    .st-active { color: #0c4a6e; background: var(--sky); border-color: transparent; }
    .st-stale { color: #78350f; background: var(--amber); border-color: transparent; }
    .st-dormant { color: #7c2d12; background: var(--orange); border-color: transparent; }
    .st-dead { color: #7f1d1d; background: var(--red); border-color: transparent; }
    .st-archived { color: #0f172a; background: var(--slate); border-color: transparent; }
    .demo-up { color: var(--lime); }
    .demo-down, .demo-error { color: var(--red); }
    .demo-none { color: var(--muted); }
    .transitions { margin: 0; padding-left: 18px; color: var(--muted); }
    .transitions a { color: var(--text); }
    footer { margin-top: 18px; color: #475569; font-size: 11px; }
  </style>
</head>
<body>
  <main class="wrap">
    <p class="eyebrow">RURO</p>
    <h1>${esc(config.render.title)}</h1>
    <p class="sub">Deterministic portfolio truth for <code>${esc(report.owner)}</code>. Zero AI core. Generated ${esc(report.generated_at)}.</p>
    <div class="stats">
      <span>scanned <strong>${report.repo_count}</strong></span>
      <span>included <strong>${report.included_count}</strong></span>
      <span>excluded <strong>${report.excluded_count}</strong></span>
      <span>${esc(mix || "—")}</span>
    </div>
    <section class="tops">${topHtml || "<p class='muted'>No repositories scored.</p>"}</section>
    <section class="panel">
      <h3>Status changes</h3>
      ${transitions}
    </section>
    <section class="panel">
      <h3>All projects</h3>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Repo</th><th>Status</th><th>Score</th>
            <th>Quality</th><th>Alive</th><th>Structure</th>
            <th>Demo</th><th>Stack</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
    <footer>Same inputs ⇒ same scores. Host via GitHub Pages from /docs.</footer>
  </main>
</body>
</html>
`;
}
