import type { RuroConfig } from "../config.js";
import type { RuroReport, ScoredRepo } from "../types.js";

function escXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Animated terminal card for profile README — looks like CLI, stays SVG.
 */
export function renderProfileSvg(
  report: RuroReport,
  config: RuroConfig,
): string {
  const top = report.repos.slice(0, Math.min(4, config.render.profile_top_n));
  const generated = report.generated_at.slice(0, 16).replace("T", " ");
  const live = report.repos.filter((r) => r.signals.demo.verified).length;

  const lines = top.map((repo, i) => {
    const deploy = repo.signals.demo.verified
      ? "verified"
      : repo.signals.demo.status.toLowerCase();
    const y = 118 + i * 28;
    const delay = (0.6 + i * 0.35).toFixed(2);
    return `
  <text class="fade" style="animation-delay:${delay}s" x="28" y="${y}" fill="#d6ff3c" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${i + 1}. ${escXml(repo.signals.name)}</text>
  <text class="fade" style="animation-delay:${delay}s" x="572" y="${y}" fill="#8a867c" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="end">${escXml(repo.status)} ${repo.score} · ${escXml(deploy)}</text>`;
  });

  const height = 150 + top.length * 28 + 56;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${height}" viewBox="0 0 600 ${height}" role="img" aria-label="Ruro CLI terminal">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#030303"/>
      <stop offset="100%" stop-color="#0a0a0a"/>
    </linearGradient>
    <style>
      @keyframes blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
      @keyframes fadein { from{opacity:0} to{opacity:1} }
      .cursor { animation: blink 1.1s step-end infinite; }
      .fade { opacity:0; animation: fadein 0.45s ease forwards; }
    </style>
  </defs>
  <rect width="600" height="${height}" rx="14" fill="url(#bg)"/>
  <rect x="1" y="1" width="598" height="${height - 2}" rx="13" fill="none" stroke="#222"/>
  <circle cx="28" cy="28" r="5" fill="#ff5c4d"/>
  <circle cx="46" cy="28" r="5" fill="#ffc14d"/>
  <circle cx="64" cy="28" r="5" fill="#d6ff3c"/>
  <text x="90" y="32" fill="#8a867c" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">ruro — github os</text>
  <text class="fade" style="animation-delay:0.1s" x="28" y="68" fill="#8a867c" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">$</text>
  <text class="fade" style="animation-delay:0.1s" x="44" y="68" fill="#f4f1ea" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">ruro view</text>
  <rect class="cursor" x="128" y="56" width="8" height="16" fill="#d6ff3c"/>
  <text class="fade" style="animation-delay:0.35s" x="28" y="92" fill="#8a867c" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${report.included_count} fleet · ${live} verified live · ${escXml(generated)} UTC</text>
${lines.join("\n")}
  <text class="fade" style="animation-delay:2s" x="28" y="${height - 20}" fill="#8a867c" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">$ ruro review &lt;repo&gt;   ·   npx · pages · deterministic core</text>
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
  const osUrl = `https://${config.owner}.github.io/ruro/`;

  const rows = top
    .map((r: ScoredRepo) => {
      const demo = r.signals.demo.verified
        ? "verified"
        : r.signals.demo.status === "NONE"
          ? "none"
          : "unproven";
      return `| **[${r.signals.name}](${r.signals.url})** | \`${r.status}\` | **${r.score}** | ${r.signals.primaryLanguage ?? "—"} | ${demo} |`;
    })
    .join("\n");

  return `<!-- RURO:START -->
## ░ RURO

GitHub OS for my repos — automatic truth, verified deploys, optional Copilot judgment.

<div align="center">

<a href="${osUrl}"><img src="${cardUrl}" width="600" alt="Ruro CLI terminal" /></a>

</div>

\`\`\`bash
npx --yes tsx github.com/${config.owner}/ruro  # or clone + npm run ruro -- view
\`\`\`

| Project | Status | Score | Stack | Deploy |
|---|---|---:|---|---|
${rows}

<sub>[Open OS](${osUrl}) · [Ruro](https://github.com/${config.owner}/ruro) · ${report.generated_at.slice(0, 10)}</sub>
<!-- RURO:END -->
`;
}
