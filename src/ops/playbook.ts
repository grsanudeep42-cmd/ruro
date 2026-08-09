/** Blocker → one concrete operator action. */

export const PLAYBOOK: Record<string, string> = {
  no_ci: "Add .github/workflows/ci.yml that runs tests on push/PR.",
  no_tests_detected: "Add at least one real test file under tests/ or *.test.* / *_test.*.",
  thin_readme: "Write a README ≥800 bytes: what it is, how to run, one screenshot/link.",
  weak_description: "Set a GitHub description (≥20 chars) that a stranger understands.",
  no_license: "Add a LICENSE file (MIT/Apache) and set the repo license metadata.",
  no_topics: "Add ≥3 topics (language, domain, type) on the repo settings page.",
  demo_unproven: "Fix the homepage deploy so the probe gets HTTP 2xx + real body.",
  homepage_unproven: "Point homepage at a live product URL — not github.com/owner/repo.",
  homepage_is_github_repo_not_deploy: "Replace homepage with the real deploy URL.",
  parking_or_soft_404: "Redeploy; probe saw parking/soft-404 content.",
  god_file: "Split or gitignore huge generated blobs (>250KB).",
  no_source_files: "Push real source files — tree looks empty/docs-only.",
  tiny_tree: "Grow the tree past a stub (more than a handful of files).",
  stub_sized: "Ship real code + tests; disk usage looks like a placeholder.",
  ci_failing: "Fix the latest failing workflow on the default branch.",
  fork: "Prefer a non-fork showcase repo, or document why the fork is yours.",
  quiet_long: "Push meaningful commits within the active window.",
  very_quiet: "Revive the repo or archive it honestly.",
  never_pushed: "Push an initial commit.",
  no_language: "Ensure GitHub detects a primary language (real source files).",
};

export function playbookFor(code: string): string {
  if (PLAYBOOK[code]) return PLAYBOOK[code];
  if (code.startsWith("HTTP")) return "Fix the deploy HTTP status so the probe passes.";
  return `Address signal \`${code}\` (see why / BIBLE).`;
}
