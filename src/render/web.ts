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
  const byName = new Map(report.repos.map((r) => [r.signals.fullName, r]));
  const fromRegs = (report.regressions ?? [])
    .map((r) => byName.get(r.fullName))
    .filter((r): r is ScoredRepo => Boolean(r));
  const uniq = new Map(fromRegs.map((r) => [r.signals.fullName, r]));
  for (const r of report.repos) {
    if (uniq.size >= 6) break;
    if (
      r.blockers.some((b) =>
        /demo_|homepage_unproven|ci_failing|no_tests|no_source|tiny_tree|no_ci/.test(
          b,
        ),
      ) ||
      (r.signals.homepageUrl && !r.signals.demo.verified)
    ) {
      uniq.set(r.signals.fullName, r);
    }
  }
  return [...uniq.values()].slice(0, 6);
}

function liveVerified(report: RuroReport): ScoredRepo[] {
  return report.repos.filter((r) => r.signals.demo.verified);
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

/**
 * Product face for Ruro — craft first. Generated static, feels inevitable.
 */
export function renderWebDashboard(
  report: RuroReport,
  config: RuroConfig,
  cwd = process.cwd(),
): string {
  const aiReviews = loadAiReviews(config, cwd);
  const attention = attentionItems(report);
  const live = liveVerified(report);
  const lead = report.repos[0];
  const show = report.repos.slice(0, 4);

  const liveCount = live.length;
  const attentionCount = attention.length;

  const attentionHtml =
    attention.length === 0
      ? `<p class="empty">Nothing urgent. Keep building.</p>`
      : attention
          .map(
            (r) => `<a class="row" href="${esc(r.signals.url)}" target="_blank" rel="noreferrer">
  <span class="row-name">${esc(r.signals.name)}</span>
  <span class="row-meta">${esc(r.blockers.slice(0, 2).join(" · ") || r.status)}</span>
  <span class="row-go" aria-hidden="true">→</span>
</a>`,
          )
          .join("\n");

  const liveHtml =
    live.length === 0
      ? `<p class="empty">No deployment passed verification. Claimed URLs do not count.</p>`
      : live
          .map((r) => {
            const d = r.signals.demo;
            const href = d.finalUrl || d.url || r.signals.url;
            return `<a class="proof" href="${esc(href)}" target="_blank" rel="noreferrer">
  <span class="proof-name">${esc(r.signals.name)}</span>
  <span class="proof-stat">${d.latencyMs ?? "—"}ms</span>
</a>`;
          })
          .join("\n");

  const showHtml = show
    .map((r, i) => {
      const n = String(i + 1).padStart(2, "0");
      const deploy = r.signals.demo.verified
        ? "verified"
        : r.signals.demo.status.toLowerCase();
      return `<a class="show" href="${esc(r.signals.url)}" target="_blank" rel="noreferrer" style="--i:${i}">
  <span class="show-i">${n}</span>
  <span class="show-body">
    <span class="show-name">${esc(r.signals.name)}</span>
    <span class="show-line">${esc(r.status)} · ${r.score} · fitness ${r.signals.fitness?.score ?? 0} · deploy ${esc(deploy)}</span>
  </span>
</a>`;
    })
    .join("\n");

  const aiHtml =
    aiReviews.filter((r) => r.status === "ok" || r.review).length === 0
      ? `<p class="empty">No deep review yet. Run <code>ruro review &lt;repo&gt;</code> when you want file-aware judgment.</p>`
      : aiReviews
          .slice(0, 3)
          .map(
            (r) => `<article class="brief">
  <h3>${esc(r.fullName.split("/")[1] ?? r.fullName)}</h3>
  <p>${esc((r.why_showable || "").slice(0, 220))}${
              (r.why_showable || "").length > 220 ? "…" : ""
            }</p>
  <p class="brief-weak">${esc((r.weaknesses ?? []).slice(0, 3).join(" · ") || "—")}</p>
</article>`,
          )
          .join("\n");

  const fleetRows = report.repos
    .map((r, i) => {
      const deploy = r.signals.demo.verified
        ? "verified"
        : r.signals.demo.status.toLowerCase();
      return `<tr>
  <td class="num">${i + 1}</td>
  <td><a href="${esc(r.signals.url)}" target="_blank" rel="noreferrer">${esc(r.signals.name)}</a></td>
  <td><span class="mark mark-${r.status.toLowerCase()}">${esc(r.status)}</span></td>
  <td class="num">${r.score}</td>
  <td class="num">${r.signals.fitness?.score ?? 0}</td>
  <td><span class="mark mark-${deploy}">${esc(deploy)}</span></td>
  <td>${esc(r.signals.primaryLanguage ?? "—")}</td>
</tr>`;
    })
    .join("\n");

  const leadLine = lead
    ? `${lead.signals.name} leads at ${lead.score}.`
    : "Fleet awaiting first scan.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ruro — GitHub OS</title>
  <meta name="description" content="GitHub-native operating surface. Automatic truth. Deployed means verified." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Syne:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #030303;
      --fg: #f4f1ea;
      --mute: #8a867c;
      --line: rgba(244,241,234,0.12);
      --lime: #d6ff3c;
      --sand: #c4b8a0;
      --bad: #ff5c4d;
      --ok: #d6ff3c;
      --warn: #ffc14d;
      --pad: clamp(20px, 4vw, 48px);
      --max: 1120px;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      color: var(--fg);
      background: var(--bg);
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 14px;
      line-height: 1.5;
      overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }
    code { color: var(--lime); font-family: inherit; }

    .veil {
      position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background:
        radial-gradient(ellipse 80% 50% at 50% -10%, rgba(214,255,60,0.09), transparent 55%),
        radial-gradient(ellipse 50% 40% at 100% 20%, rgba(196,184,160,0.06), transparent 50%),
        linear-gradient(180deg, #030303 0%, #070707 100%);
    }
    .veil::after {
      content: "";
      position: absolute; inset: 0;
      background-image: linear-gradient(rgba(244,241,234,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(244,241,234,0.03) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: radial-gradient(ellipse at 50% 0%, #000 20%, transparent 70%);
      animation: drift 28s linear infinite;
    }
    @keyframes drift {
      from { transform: translateY(0); }
      to { transform: translateY(64px); }
    }

    .wrap { position: relative; z-index: 1; }

    .hero {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: var(--pad);
      padding-bottom: clamp(40px, 8vh, 80px);
      max-width: var(--max);
      margin: 0 auto;
    }
    .brand {
      font-family: Syne, sans-serif;
      font-weight: 800;
      font-size: clamp(4.8rem, 18vw, 11rem);
      line-height: 0.82;
      letter-spacing: -0.06em;
      margin: 0;
      opacity: 0;
      animation: rise 1s cubic-bezier(0.16,1,0.3,1) 0.05s forwards;
    }
    .brand em {
      font-style: normal;
      color: var(--lime);
    }
    .headline {
      font-family: "Instrument Serif", Georgia, serif;
      font-weight: 400;
      font-size: clamp(1.6rem, 3.6vw, 2.6rem);
      line-height: 1.15;
      max-width: 16ch;
      margin: 28px 0 14px;
      opacity: 0;
      animation: rise 1s cubic-bezier(0.16,1,0.3,1) 0.18s forwards;
    }
    .sub {
      color: var(--mute);
      max-width: 36rem;
      margin: 0 0 28px;
      font-size: 13px;
      opacity: 0;
      animation: rise 1s cubic-bezier(0.16,1,0.3,1) 0.28s forwards;
    }
    .cta {
      display: flex; flex-wrap: wrap; gap: 12px;
      opacity: 0;
      animation: rise 1s cubic-bezier(0.16,1,0.3,1) 0.38s forwards;
    }
    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 18px;
      border: 1px solid var(--fg);
      background: var(--fg);
      color: var(--bg);
      font-family: Syne, sans-serif;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.02em;
      transition: transform 0.25s ease, background 0.25s ease, color 0.25s ease;
    }
    .btn:hover { transform: translateY(-2px); }
    .btn-ghost {
      background: transparent;
      color: var(--fg);
    }
    .btn-ghost:hover { background: rgba(244,241,234,0.06); }
    .pulse {
      width: 8px; height: 8px; background: var(--lime);
      animation: blink 2.2s ease-in-out infinite;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.25; }
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(28px); }
      to { opacity: 1; transform: translateY(0); }
    }

    section {
      max-width: var(--max);
      margin: 0 auto;
      padding: 72px var(--pad);
      border-top: 1px solid var(--line);
    }
    .sec-kicker {
      font-family: Syne, sans-serif;
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--lime);
      margin: 0 0 10px;
    }
    .sec-title {
      font-family: "Instrument Serif", Georgia, serif;
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 400;
      margin: 0 0 12px;
      max-width: 14ch;
      line-height: 1.1;
    }
    .sec-copy {
      color: var(--mute);
      max-width: 34rem;
      margin: 0 0 32px;
      font-size: 13px;
    }

    .split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
    }
    @media (max-width: 840px) {
      .split { grid-template-columns: 1fr; gap: 40px; }
    }

    .row, .proof, .show {
      display: flex; align-items: baseline; gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid var(--line);
      transition: color 0.2s ease, padding-left 0.25s ease;
    }
    .row:hover, .proof:hover, .show:hover {
      color: var(--lime);
      padding-left: 6px;
    }
    .row-name, .proof-name, .show-name {
      font-family: Syne, sans-serif;
      font-weight: 700;
      font-size: 16px;
      min-width: 0;
    }
    .row-meta, .show-line {
      color: var(--mute);
      font-size: 12px;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row:hover .row-meta, .show:hover .show-line { color: rgba(214,255,60,0.7); }
    .row-go, .proof-stat {
      color: var(--mute);
      font-size: 12px;
      margin-left: auto;
    }
    .proof-stat { color: var(--lime); }

    .show { opacity: 0; animation: rise 0.8s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay: calc(0.08s * var(--i) + 0.1s); }
    .show-i {
      font-family: "Instrument Serif", Georgia, serif;
      font-size: 28px;
      color: var(--sand);
      width: 2.2ch;
    }
    .show-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

    .meter {
      display: flex; gap: 28px; flex-wrap: wrap;
      margin-top: 8px;
    }
    .meter div { min-width: 88px; }
    .meter strong {
      display: block;
      font-family: Syne, sans-serif;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1;
      margin-bottom: 6px;
    }
    .meter span { color: var(--mute); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }

    .brief {
      padding: 20px 0;
      border-bottom: 1px solid var(--line);
    }
    .brief h3 {
      font-family: Syne, sans-serif;
      font-size: 18px;
      margin: 0 0 8px;
    }
    .brief p { margin: 0 0 8px; color: var(--fg); max-width: 52rem; }
    .brief-weak { color: var(--mute) !important; font-size: 12px; }

    .empty { color: var(--mute); margin: 0; }

    .fleet-wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      text-align: left;
      color: var(--mute);
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 10px;
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
    }
    td {
      padding: 12px 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: middle;
    }
    td a:hover { color: var(--lime); }
    .num { font-variant-numeric: tabular-nums; color: var(--mute); }
    .mark {
      display: inline-block;
      padding: 2px 6px;
      border: 1px solid var(--line);
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .mark-live, .mark-verified { border-color: var(--ok); color: var(--ok); }
    .mark-active { border-color: var(--sand); color: var(--sand); }
    .mark-stale, .mark-dormant, .mark-warn { border-color: var(--warn); color: var(--warn); }
    .mark-dead, .mark-down, .mark-error { border-color: var(--bad); color: var(--bad); }
    .mark-archived, .mark-none { color: var(--mute); }

    footer {
      max-width: var(--max);
      margin: 0 auto;
      padding: 28px var(--pad) 64px;
      color: var(--mute);
      font-size: 11px;
      border-top: 1px solid var(--line);
      display: flex;
      flex-wrap: wrap;
      gap: 12px 24px;
      justify-content: space-between;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      .brand, .headline, .sub, .cta, .show { opacity: 1; transform: none; }
    }
  </style>
</head>
<body>
  <div class="veil" aria-hidden="true"></div>
  <div class="wrap">
    <header class="hero">
      <h1 class="brand">RURO<em>.</em></h1>
      <p class="headline">Prove. Remember. Operate.</p>
      <p class="sub">GitHub OS for <code>${esc(report.owner)}</code>. Auditable deploys · contribution scores · regressions. Run <code>npm run ruro</code> → <code>brief</code>. ${esc(leadLine)}</p>
      <div class="cta">
        <a class="btn" href="#proven"><span class="pulse" aria-hidden="true"></span> Proven deploys</a>
        <a class="btn btn-ghost" href="#fleet">Fleet map</a>
      </div>
    </header>

    <section id="signal" aria-label="Signal">
      <p class="sec-kicker">Signal</p>
      <h2 class="sec-title">What is true right now</h2>
      <p class="sec-copy">Refreshed ${esc(fmtWhen(report.generated_at))}. Same inputs ⇒ same scores. This is the operating pulse — not a vanity chart.</p>
      <div class="meter">
        <div><strong>${report.included_count}</strong><span>in fleet</span></div>
        <div><strong>${liveCount}</strong><span>verified live</span></div>
        <div><strong>${attentionCount}</strong><span>need attention</span></div>
        <div><strong>${report.status_counts.LIVE ?? 0}</strong><span>live status</span></div>
      </div>
    </section>

    <section aria-label="Work">
      <div class="split">
        <div>
          <p class="sec-kicker">Attention</p>
          <h2 class="sec-title">Fix these first</h2>
          <p class="sec-copy">Regressions and blockers the OS will not politely ignore.</p>
          ${attentionHtml}
        </div>
        <div id="proven">
          <p class="sec-kicker">Proven</p>
          <h2 class="sec-title">Deployments that answered</h2>
          <p class="sec-copy">Auditable probe: hash, SPA shell, redirects — not a homepage string on GitHub.</p>
          ${liveHtml}
        </div>
      </div>
    </section>

    <section aria-label="Showables">
      <p class="sec-kicker">Show path</p>
      <h2 class="sec-title">What to open in an interview</h2>
      <p class="sec-copy">Ranked by showability. Fitness is without-AI tree truth. LIVE = verified deploy and recent push (active_days). Deploy “verified” is separate from status.</p>
      <div>${showHtml}</div>
    </section>

    <section aria-label="Judgment">
      <p class="sec-kicker">Judgment</p>
      <h2 class="sec-title">Optional judgment</h2>
      <p class="sec-copy">Copilot garnish only. Never moves scores. Prefer <code>brief</code> / <code>why</code> in the CLI for truth.</p>
      ${aiHtml}
    </section>

    <section id="fleet" aria-label="Fleet">
      <p class="sec-kicker">Fleet</p>
      <h2 class="sec-title">Every owned repo</h2>
      <p class="sec-copy">Full inventory. Scroll when you need the whole map.</p>
      <div class="fleet-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Repo</th><th>Status</th><th>Score</th>
              <th>Fitness</th><th>Deploy</th><th>Stack</th>
            </tr>
          </thead>
          <tbody>${fleetRows}</tbody>
        </table>
      </div>
    </section>

    <footer>
      <span>Ruro · GitHub OS · ${esc(report.owner)}</span>
      <span>Pages from /docs · CLI: <code>ruro brief</code> · <code>ruro why</code></span>
    </footer>
  </div>
</body>
</html>
`;
}
