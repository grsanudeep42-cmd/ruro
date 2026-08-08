import type { RuroConfig } from "../config.js";
import type { RuroReport, ScoredRepo } from "../types.js";

function escXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusTone(status: string): string {
  switch (status) {
    case "LIVE":
      return "#b6ff3b";
    case "ACTIVE":
      return "#7dd3fc";
    case "STALE":
      return "#fbbf24";
    case "DORMANT":
      return "#fb923c";
    case "DEAD":
      return "#f87171";
    case "ARCHIVED":
      return "#94a3b8";
    default:
      return "#e2e8f0";
  }
}

function barWidth(score: number, max = 120): number {
  return Math.max(4, Math.round((Math.min(100, Math.max(0, score)) / 100) * max));
}

export function renderProfileSvg(
  report: RuroReport,
  config: RuroConfig,
): string {
  const top = report.repos.slice(0, config.render.profile_top_n);
  const generated = report.generated_at.slice(0, 10);
  const rows = top
    .map((repo, i) => {
      const y = 118 + i * 44;
      const tone = statusTone(repo.status);
      const w = barWidth(repo.score);
      return `
  <text x="28" y="${y}" fill="#94a3b8" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${i + 1}</text>
  <text x="48" y="${y}" fill="#f8fafc" font-size="14" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escXml(repo.signals.name)}</text>
  <text x="48" y="${y + 16}" fill="#64748b" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escXml(repo.signals.primaryLanguage ?? "—")} · ${escXml(repo.status)}</text>
  <rect x="430" y="${y - 10}" width="120" height="8" rx="4" fill="#1e293b"/>
  <rect x="430" y="${y - 10}" width="${w}" height="8" rx="4" fill="${tone}"/>
  <text x="560" y="${y}" fill="${tone}" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="end">${repo.score}</text>`;
    })
    .join("\n");

  const height = 130 + top.length * 44 + 36;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${height}" viewBox="0 0 600 ${height}" role="img" aria-label="Ruro portfolio scorecard">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07090d"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="600" height="${height}" rx="18" fill="url(#bg)"/>
  <rect x="1" y="1" width="598" height="${height - 2}" rx="17" fill="none" stroke="#1f2937"/>
  <text x="28" y="42" fill="#b6ff3b" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" letter-spacing="2">RURO</text>
  <text x="28" y="68" fill="#f8fafc" font-size="22" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">portfolio truth</text>
  <text x="572" y="42" fill="#64748b" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="end">${escXml(generated)}</text>
  <text x="28" y="92" fill="#94a3b8" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${report.included_count} scored · LIVE ${report.status_counts.LIVE} · ACTIVE ${report.status_counts.ACTIVE} · STALE ${report.status_counts.STALE}</text>
  <line x1="28" y1="104" x2="572" y2="104" stroke="#1f2937"/>
${rows}
  <text x="28" y="${height - 16}" fill="#475569" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">deterministic · zero AI · github-native</text>
</svg>
`;
}

export function renderProfileSnippet(
  report: RuroReport,
  config: RuroConfig,
): string {
  const top = report.repos.slice(0, config.render.profile_top_n);
  const svgPath = config.render.profile_svg_path;
  const cardUrl = `https://raw.githubusercontent.com/${config.owner}/ruro/main/${svgPath}`;

  const rows = top
    .map((r: ScoredRepo) => {
      const demo =
        r.signals.demo.status === "UP"
          ? "live demo"
          : r.signals.demo.status === "NONE"
            ? "no demo"
            : "demo down";
      return `| **[${r.signals.name}](${r.signals.url})** | \`${r.status}\` | **${r.score}** | ${r.signals.primaryLanguage ?? "—"} | ${demo} |`;
    })
    .join("\n");

  return `<!-- RURO:START -->
## ░ PORTFOLIO TRUTH

<div align="center">

<img src="${cardUrl}" width="600" alt="Ruro portfolio scorecard" />

</div>

| Project | Status | Score | Stack | Demo |
|---|---|---:|---|---|
${rows}

<sub>Auto-maintained by [Ruro](https://github.com/${config.owner}/ruro) · ${report.generated_at.slice(0, 10)} · zero AI</sub>
<!-- RURO:END -->
`;
}
