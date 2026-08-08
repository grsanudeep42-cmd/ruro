import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RuroConfig } from "../config.js";
import type { RuroReport, ScoredRepo } from "../types.js";

interface AiReviewLite {
  fullName: string;
  status: string;
  why_showable?: string;
  strengths?: string[];
  weaknesses?: string[];
  review?: string;
}

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

function loadAiReviews(config: RuroConfig, cwd = process.cwd()): AiReviewLite[] {
  const path = resolve(cwd, config.ai.cache_dir, "latest.json");
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      repos?: AiReviewLite[];
    };
    return Array.isArray(parsed.repos) ? parsed.repos : [];
  } catch {
    return [];
  }
}

function attentionItems(report: RuroReport): ScoredRepo[] {
  return report.repos
    .filter(
      (r) =>
        r.blockers.some((b) =>
          /demo_|homepage_unproven|ci_failing|no_tests|no_source|tiny_tree/.test(
            b,
          ),
        ) ||
        (r.signals.homepageUrl && !r.signals.demo.verified),
    )
    .slice(0, 8);
}

function liveVerified(report: RuroReport): ScoredRepo[] {
  return report.repos.filter((r) => r.signals.demo.verified).slice(0, 8);
}

/**
 * GitHub OS home — not a scoreboard. Living workspace for portfolio truth.
 */
export function renderWebDashboard(
  report: RuroReport,
  config: RuroConfig,
  cwd = process.cwd(),
): string {
  const aiReviews = loadAiReviews(config, cwd);
  const attention = attentionItems(report);
  const live = liveVerified(report);
  const top = report.repos.slice(0, 5);
  const mix = Object.entries(report.status_counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join(" · ");

  const attentionHtml =
    attention.length === 0
      ? `<p class="muted">No urgent blockers. Fleet looks clean.</p>`
      : `<ul class="list">${attention
          .map(
            (r) =>
              `<li><a href="${esc(r.signals.url)}">${esc(r.signals.name)}</a> <span class="pill ${statusClass(r.status)}">${esc(r.status)}</span> <span class="muted">${esc(r.blockers.slice(0, 3).join(" · "))}</span></li>`,
          )
          .join("")}</ul>`;

  const liveHtml =
    live.length === 0
      ? `<p class="muted">No verified deployments yet. Claimed URLs without proof do not count.</p>`
      : `<ul class="list">${live
          .map((r) => {
            const d = r.signals.demo;
            return `<li><a href="${esc(d.finalUrl || d.url || r.signals.url)}" target="_blank" rel="noreferrer">${esc(r.signals.name)}</a> <span class="pill demo-up">VERIFIED</span> <span class="muted">${d.latencyMs ?? "—"}ms · ${d.proofBytes ?? 0}B</span></li>`;
          })
          .join("")}</ul>`;

  const showHtml = top
    .map(
      (r, i) => `<article class="show-card">
  <div class="rank">0${i + 1}</div>
  <h2><a href="${esc(r.signals.url)}">${esc(r.signals.name)}</a></h2>
  <p><span class="pill ${statusClass(r.status)}">${esc(r.status)}</span> <span class="score">${r.score}</span>
  <span class="muted">fitness ${r.signals.fitness.score}</span></p>
  <p class="muted">${esc(r.drivers.slice(0, 3).join(" · ") || "—")}</p>
</article>`,
    )
    .join("\n");

  const aiHtml =
    aiReviews.length === 0
      ? `<p class="muted">Copilot judgment off. Run <code>ruro review</code> when you want code-depth. Scores never depend on AI.</p>`
      : aiReviews
          .map(
            (r) => `<article class="ai-card">
  <h4>${esc(r.fullName)} <span class="pill">${esc(r.status)}</span></h4>
  <p>${esc(r.why_showable || "—")}</p>
  <p class="muted">${esc((r.weaknesses ?? []).slice(0, 4).join(" · ") || "—")}</p>
</article>`,
          )
          .join("\n");

  const fleetRows = report.repos
    .map((r, i) => {
      const demo = r.signals.demo.verified
        ? "VERIFIED"
        : r.signals.demo.status;
      return `<tr>
  <td>${i + 1}</td>
  <td><a href="${esc(r.signals.url)}">${esc(r.signals.name)}</a></td>
  <td><span class="pill ${statusClass(r.status)}">${esc(r.status)}</span></td>
  <td>${r.score}</td>
  <td>${r.signals.fitness.score}</td>
  <td><span class="pill demo-${demo.toLowerCase()}">${esc(demo)}</span></td>
  <td>${esc(r.signals.primaryLanguage ?? "—")}</td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ruro · GitHub OS</title>
  <style>
    :root {
      --bg: #06080c;
      --ink: #e8edf5;
      --muted: #8b97a8;
      --line: #1a2330;
      --panel: #0c1118;
      --lime: #c8f531;
      --sky: #6ec8ff;
      --warn: #ffb020;
      --bad: #ff6b6b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
      background:
        radial-gradient(900px 420px at 0% 0%, #132418 0%, transparent 55%),
        radial-gradient(700px 380px at 100% 10%, #0d1a28 0%, transparent 50%),
        var(--bg);
      min-height: 100vh;
    }
    .shell { max-width: 1080px; margin: 0 auto; padding: 36px 20px 96px; }
    .brand {
      font-size: clamp(42px, 8vw, 72px);
      line-height: 0.95;
      letter-spacing: -0.04em;
      margin: 0 0 10px;
      font-weight: 600;
    }
    .brand span { color: var(--lime); }
    .lede { color: var(--muted); max-width: 46rem; line-height: 1.55; margin: 0 0 28px; }
    .pulse {
      display: flex; flex-wrap: wrap; gap: 10px 18px;
      border: 1px solid var(--line); background: rgba(12,17,24,0.9);
      padding: 12px 14px; margin-bottom: 28px;
    }
    .pulse strong { color: var(--ink); }
    .pulse span { color: var(--muted); font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }
    .panel {
      background: var(--panel); border: 1px solid var(--line); padding: 16px 18px;
    }
    .panel h3 {
      margin: 0 0 12px; font-size: 11px; letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--muted); font-weight: 500;
    }
    .list { list-style: none; margin: 0; padding: 0; }
    .list li { padding: 8px 0; border-top: 1px solid var(--line); font-size: 13px; }
    .list li:first-child { border-top: 0; padding-top: 0; }
    .list a { color: var(--ink); text-decoration: none; }
    .list a:hover { color: var(--lime); }
    .shows { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 14px 0 22px; }
    @media (max-width: 960px) { .shows { grid-template-columns: 1fr 1fr; } }
    .show-card { border: 1px solid var(--line); background: var(--panel); padding: 14px; min-height: 120px; }
    .rank { color: var(--lime); font-size: 11px; letter-spacing: 0.12em; margin-bottom: 8px; }
    .show-card h2 { margin: 0 0 8px; font-size: 15px; }
    .show-card a { color: var(--ink); text-decoration: none; }
    .show-card a:hover { color: var(--lime); }
    .score { color: var(--lime); margin-left: 6px; }
    .muted { color: var(--muted); font-size: 12px; }
    .pill {
      display: inline-block; padding: 1px 7px; border: 1px solid var(--line);
      font-size: 10px; letter-spacing: 0.04em;
    }
    .st-live { background: var(--lime); color: #08110a; border-color: transparent; }
    .st-active { background: var(--sky); color: #041018; border-color: transparent; }
    .st-stale { background: var(--warn); color: #1a1000; border-color: transparent; }
    .st-dormant, .st-dead { background: var(--bad); color: #1a0505; border-color: transparent; }
    .st-archived { background: #64748b; color: #0b1220; border-color: transparent; }
    .demo-verified, .demo-up { color: var(--lime); }
    .demo-down, .demo-error { color: var(--bad); }
    .demo-none { color: var(--muted); }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 9px 6px; border-bottom: 1px solid var(--line); }
    th { color: var(--muted); font-weight: 500; }
    td a { color: var(--ink); text-decoration: none; }
    td a:hover { color: var(--lime); }
    .ai-card { border-top: 1px solid var(--line); padding: 12px 0; }
    .ai-card:first-child { border-top: 0; padding-top: 0; }
    .ai-card h4 { margin: 0 0 6px; font-size: 13px; }
    footer { margin-top: 22px; color: #4b5568; font-size: 11px; }
    code { color: var(--sky); }
  </style>
</head>
<body>
  <main class="shell">
    <h1 class="brand">RURO <span>OS</span></h1>
    <p class="lede">GitHub-native operating surface for <code>${esc(report.owner)}</code>. Automatic truth. Deployed means verified. Core is zero-AI; Copilot is optional judgment. Generated ${esc(report.generated_at)}.</p>
    <div class="pulse">
      <span>fleet <strong>${report.included_count}</strong>/${report.repo_count}</span>
      <span>excluded <strong>${report.excluded_count}</strong></span>
      <span>verified live <strong>${live.length}</strong></span>
      <span>${esc(mix || "—")}</span>
    </div>

    <div class="grid">
      <section class="panel">
        <h3>Attention</h3>
        ${attentionHtml}
      </section>
      <section class="panel">
        <h3>Verified deployments</h3>
        ${liveHtml}
      </section>
    </div>

    <section>
      <h3 style="margin:18px 0 10px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);">Showables</h3>
      <div class="shows">${showHtml}</div>
    </section>

    <section class="panel" style="margin-bottom:14px">
      <h3>Copilot judgment</h3>
      ${aiHtml}
    </section>

    <section class="panel">
      <h3>Fleet</h3>
      <table>
        <thead>
          <tr><th>#</th><th>Repo</th><th>Status</th><th>Score</th><th>Fitness</th><th>Deploy</th><th>Stack</th></tr>
        </thead>
        <tbody>${fleetRows}</tbody>
      </table>
    </section>
    <footer>Claimed homepage ≠ live. Same inputs ⇒ same scores. Host from /docs on GitHub Pages.</footer>
  </main>
</body>
</html>
`;
}
