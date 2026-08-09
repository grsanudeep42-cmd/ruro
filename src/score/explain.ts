/** Human meanings for driver/blocker codes — CLI / audits must never show bare tokens alone. */
export const SIGNAL_EXPLAIN: Record<string, string> = {
  manifest: "Package/manifest file present (package.json, pyproject, go.mod, Cargo.toml, …).",
  substantial_code: "Repo disk usage suggests more than a stub (≥200KB).",
  code_fitness_high: "Tree scan found nontrivial source + healthy test signal (fitness ≥70).",
  code_fitness_ok: "Tree scan found real source files (fitness ≥45).",
  no_source_files: "Tree scan found almost no source files — looks empty or docs-only.",
  tiny_tree: "Very few files in the tree — likely incomplete or placeholder.",
  test_files_in_tree: "Test files detected in the git tree (not just a script name).",
  god_file: "At least one huge non-binary blob — possible generated dump or unmaintainable file.",
  src_layout: "Has a src/ directory.",
  containerized: "Dockerfile/Containerfile present.",
  tests_present: "Tests heuristically detected (dirs, configs, or test scripts).",
  test_script: "package.json/pyproject declares a runnable test script/tool.",
  no_tests_detected: "No tests/dirs/scripts detected — quality pillar takes a hit.",
  ci_workflows: ".github/workflows YAML present.",
  no_ci: "No CI workflows found.",
  ci_green: "Latest workflow run on default branch concluded success.",
  ci_failing: "Latest workflow run failed.",
  lint_config: "Lint/format config detected (eslint, ruff, prettier, …).",
  dependabot: "Dependabot config present.",
  lockfile: "Dependency lockfile present.",
  codeowners: "CODEOWNERS present.",
  stub_sized: "Tiny disk usage + no tests — treated as stub risk.",
  no_language: "No primary language and very small disk — weak signal of real code.",
  demo_verified: "Homepage answered HTTP with proof (SPA shell or real body) — not github.com/repo.",
  demo_unproven: "Homepage claimed but probe failed or was not verified.",
  homepage_unproven: "Homepage URL set but not verified live.",
  parking_or_soft_404: "Response looked like parking/soft-404 (or empty non-SPA HTML).",
  homepage_is_github_repo_not_deploy: "Homepage points at github.com/owner/repo — not a product deploy.",
  redirected_to_github_repo: "Homepage redirected to the GitHub repo page.",
  empty_or_tiny_response: "HTTP ok but body too small to count as a real page.",
  pushed_2w: "Pushed within the last 14 days.",
  pushed_active_window: "Pushed within the active window (config active_days).",
  pushed_stale_window: "Pushed in the stale window — still some alive signal.",
  high_cadence_30d: "≥5 commits in last 30 days.",
  cadence_30d: "≥1 commit in last 30 days.",
  cadence_90d: "≥3 commits in last 90 days (no 30d activity).",
  quiet_long: "Quiet past stale threshold.",
  very_quiet: "Quiet past dormant threshold.",
  never_pushed: "No push timestamp.",
  has_releases: "At least one GitHub release.",
  recent_release: "Release within ~180 days.",
  ci_fresh: "Successful workflow within last 30 days.",
  description: "Description ≥20 chars.",
  weak_description: "Missing/short description.",
  readme_substance: "README ≥800 bytes.",
  readme_basic: "README ≥200 bytes.",
  thin_readme: "README missing or very thin.",
  license: "LICENSE file or SPDX license detected.",
  no_license: "No license signal.",
  topics: "≥3 topics set.",
  no_topics: "No topics.",
  homepage_verified: "Homepage URL verified by probe.",
  has_language: "Primary language detected by GitHub.",
  owner_authored: "≥70% of sampled commits authored by the fleet owner.",
  low_owner_share: "Owner authored <30% of sampled commits — vanity/fork risk.",
  ci_matrix_green: "Last 3–5 workflow runs all succeeded.",
  ci_matrix_red: "Last 3–5 workflow runs all failed.",
  fork: "Repository is a fork — structure penalty.",
};

export function explainCode(code: string): string {
  if (SIGNAL_EXPLAIN[code]) return SIGNAL_EXPLAIN[code];
  // probe error codes sometimes get underscored into blockers
  if (SIGNAL_EXPLAIN[code.replace(/_/g, "_")]) {
    return SIGNAL_EXPLAIN[code];
  }
  return `Signal code \`${code}\` (see BIBLE / score module).`;
}

export function explainContribution(c: {
  code: string;
  pillar: string;
  delta: number;
}): string {
  const sign = c.delta > 0 ? `+${c.delta}` : String(c.delta);
  return `${c.code} (${c.pillar} ${sign}): ${explainCode(c.code)}`;
}

export function explainScoreLine(
  score: number,
  pillars: { quality: number; alive: number; structure: number },
  weights: { quality: number; alive: number; structure: number },
): string[] {
  const q = weights.quality * pillars.quality;
  const a = weights.alive * pillars.alive;
  const s = weights.structure * pillars.structure;
  return [
    `showability = ${weights.quality}*quality + ${weights.alive}*alive + ${weights.structure}*structure`,
    `           = ${weights.quality}*${pillars.quality} + ${weights.alive}*${pillars.alive} + ${weights.structure}*${pillars.structure}`,
    `           ≈ ${q.toFixed(1)} + ${a.toFixed(1)} + ${s.toFixed(1)} → ${score}`,
  ];
}
