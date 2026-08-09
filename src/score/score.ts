import type { RuroConfig } from "../config.js";
import type {
  PillarBreakdown,
  RepoSignals,
  RepoStatus,
  ScoreContribution,
  ScorePillar,
  ScoredRepo,
} from "../types.js";

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function daysSince(
  iso: string | null | undefined,
  now: Date,
): number | null {
  if (!iso) return null;
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

const BASE: Record<ScorePillar, number> = {
  quality: 18,
  alive: 0,
  structure: 15,
};

function qualityFeatures(s: RepoSignals): ScoreContribution[] {
  const out: ScoreContribution[] = [];
  const q = (code: string, delta: number): void => {
    out.push({ code, pillar: "quality", delta });
  };

  if (s.hasPackageManifest) q("manifest", 8);
  if (s.substantialCodebase) q("substantial_code", 10);

  if (s.fitness.score >= 70) q("code_fitness_high", 14);
  else if (s.fitness.score >= 45) q("code_fitness_ok", 8);
  else if (s.fitness.flags.includes("no_source_files")) q("no_source_files", -18);
  else if (s.fitness.flags.includes("tiny_tree")) q("tiny_tree", -10);

  if (s.fitness.flags.includes("has_test_files")) q("test_files_in_tree", 6);
  if (s.fitness.flags.includes("god_file")) q("god_file", -6);

  if (s.hasSrcLayout) q("src_layout", 4);
  if (s.hasContainerfile) q("containerized", 4);

  if (s.hasTestsHeuristic) {
    q("tests_present", 20);
    if (s.hasTestScript) q("test_script", 4);
  } else {
    q("no_tests_detected", 0); // blocker-only marker (no delta)
  }

  if (s.hasWorkflows) q("ci_workflows", 12);
  else q("no_ci", 0);

  if (s.recentWorkflowConclusion === "success") q("ci_green", 12);
  else if (s.recentWorkflowConclusion === "failure") q("ci_failing", -8);

  if (s.hasLintConfigHeuristic) q("lint_config", 10);
  if (s.hasDependabotConfig) q("dependabot", 8);
  if (s.hasLockfile) q("lockfile", 6);
  if (s.hasCodeowners) q("codeowners", 4);

  if (s.diskUsageKb > 0 && s.diskUsageKb < 40 && !s.hasTestsHeuristic) {
    q("stub_sized", -15);
  }
  if (!s.primaryLanguage && s.diskUsageKb < 80) q("no_language", -10);

  return out;
}

function aliveFeatures(
  s: RepoSignals,
  thresholds: RuroConfig["thresholds"],
  now: Date,
): ScoreContribution[] {
  const out: ScoreContribution[] = [];
  const a = (code: string, delta: number): void => {
    out.push({ code, pillar: "alive", delta });
  };
  const pushAge = daysSince(s.pushedAt, now);

  if (s.demo.status === "UP" && s.demo.verified) a("demo_verified", 35);
  else if (s.demo.status === "DOWN" || s.demo.status === "ERROR") {
    a("demo_unproven", -10);
    if (s.demo.error) {
      a(s.demo.error.replace(/\s+/g, "_").slice(0, 40), 0);
    }
  } else if (s.homepageUrl) {
    a("homepage_unproven", 0);
  }

  if (pushAge === null) a("never_pushed", 0);
  else if (pushAge <= 14) a("pushed_2w", 30);
  else if (pushAge <= thresholds.active_days) a("pushed_active_window", 22);
  else if (pushAge <= thresholds.stale_days) a("pushed_stale_window", 12);
  else if (pushAge <= thresholds.dormant_days) a("quiet_long", 5);
  else a("very_quiet", 0);

  if (s.commitsLast30Days >= 5) a("high_cadence_30d", 15);
  else if (s.commitsLast30Days >= 1) a("cadence_30d", 8);
  else if (s.commitsLast90Days >= 3) a("cadence_90d", 5);

  if (s.releasesCount > 0) {
    a("has_releases", 8);
    const releaseAge = daysSince(s.latestReleaseAt, now);
    if (releaseAge !== null && releaseAge <= 180) a("recent_release", 5);
  }

  if (
    s.recentWorkflowConclusion === "success" &&
    s.recentWorkflowAgeDays !== null &&
    s.recentWorkflowAgeDays <= 30
  ) {
    a("ci_fresh", 7);
  }

  if (s.ciConclusions.length >= 3) {
    const ok = s.ciConclusions.filter((c) => c === "success").length;
    if (ok === s.ciConclusions.length) a("ci_matrix_green", 5);
    else if (ok === 0) a("ci_matrix_red", -6);
  }

  return out;
}

function structureFeatures(s: RepoSignals): ScoreContribution[] {
  const out: ScoreContribution[] = [];
  const st = (code: string, delta: number): void => {
    out.push({ code, pillar: "structure", delta });
  };

  if (s.description && s.description.trim().length >= 20) st("description", 12);
  else st("weak_description", 0);

  if (s.readmeBytes !== null && s.readmeBytes >= 800) st("readme_substance", 20);
  else if (s.readmeBytes !== null && s.readmeBytes >= 200) st("readme_basic", 10);
  else st("thin_readme", 0);

  if (s.hasLicenseFile || s.licenseSpdx) st("license", 15);
  else st("no_license", 0);

  if (s.topics.length >= 3) st("topics", 8);
  else if (s.topics.length === 0) st("no_topics", 0);

  if (s.homepageUrl && s.demo.verified) st("homepage_verified", 10);
  else if (s.homepageUrl) st("homepage_unproven", 0);

  if (s.primaryLanguage) st("has_language", 8);
  if (s.isFork) st("fork", -20);

  if (s.ownerCommitShare !== null) {
    if (s.ownerCommitShare >= 70) st("owner_authored", 6);
    else if (s.ownerCommitShare < 30) st("low_owner_share", -8);
  }

  return out;
}

function pillarFrom(
  pillar: ScorePillar,
  features: ScoreContribution[],
): number {
  const sum = features
    .filter((f) => f.pillar === pillar)
    .reduce((acc, f) => acc + f.delta, 0);
  return clamp(BASE[pillar] + sum);
}

/** Hurt codes — always blockers even if they carry a small non-negative delta. */
const HURT_CODES = new Set([
  "no_tests_detected",
  "no_ci",
  "no_source_files",
  "tiny_tree",
  "god_file",
  "stub_sized",
  "no_language",
  "ci_failing",
  "demo_unproven",
  "homepage_unproven",
  "never_pushed",
  "quiet_long",
  "very_quiet",
  "weak_description",
  "thin_readme",
  "no_license",
  "no_topics",
  "fork",
  "parking_or_soft_404",
  "homepage_is_github_repo_not_deploy",
  "redirected_to_github_repo",
  "empty_or_tiny_response",
  "low_owner_share",
  "ci_matrix_red",
]);

function driversFrom(features: ScoreContribution[]): string[] {
  return [
    ...new Set(
      features
        .filter((f) => f.delta > 0 && !HURT_CODES.has(f.code))
        .map((f) => f.code),
    ),
  ].slice(0, 10);
}

function blockersFrom(features: ScoreContribution[]): string[] {
  return [
    ...new Set(
      features
        .filter((f) => f.delta < 0 || HURT_CODES.has(f.code))
        .map((f) => f.code),
    ),
  ].slice(0, 10);
}

/**
 * LIVE = verified deploy AND push within active_days.
 * Verified but older still shows deploy as verified; status follows age.
 */
export function deriveStatus(
  s: RepoSignals,
  thresholds: RuroConfig["thresholds"],
  now = new Date(),
): RepoStatus {
  if (s.isArchived) return "ARCHIVED";

  const pushAge = daysSince(s.pushedAt, now);
  const demoUp = s.demo.status === "UP" && s.demo.verified;

  if (demoUp && pushAge !== null && pushAge <= thresholds.active_days) {
    return "LIVE";
  }

  if (pushAge !== null && pushAge <= thresholds.active_days) {
    return "ACTIVE";
  }
  if (pushAge !== null && pushAge <= thresholds.stale_days) return "STALE";
  if (pushAge !== null && pushAge <= thresholds.dormant_days) return "DORMANT";
  return "DEAD";
}

export function scoreRepo(
  s: RepoSignals,
  config: RuroConfig,
  now = new Date(),
): ScoredRepo {
  const contributions = [
    ...qualityFeatures(s),
    ...aliveFeatures(s, config.thresholds, now),
    ...structureFeatures(s),
  ];

  const pillars: PillarBreakdown = {
    quality: pillarFrom("quality", contributions),
    alive: pillarFrom("alive", contributions),
    structure: pillarFrom("structure", contributions),
  };

  const score = clamp(
    config.weights.quality * pillars.quality +
      config.weights.alive * pillars.alive +
      config.weights.structure * pillars.structure,
  );

  // Prefer alive drivers first in the shortlist
  const aliveFirst = [
    ...driversFrom(contributions.filter((c) => c.pillar === "alive")),
    ...driversFrom(contributions.filter((c) => c.pillar !== "alive")),
  ];
  const drivers = [...new Set(aliveFirst)].slice(0, 10);
  const blockers = blockersFrom(contributions);

  return {
    signals: s,
    score,
    pillars,
    status: deriveStatus(s, config.thresholds, now),
    drivers,
    blockers,
    contributions,
  };
}

export function scoreAll(
  signals: RepoSignals[],
  config: RuroConfig,
  now = new Date(),
): ScoredRepo[] {
  return signals
    .map((s) => scoreRepo(s, config, now))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.signals.fullName.localeCompare(b.signals.fullName);
    });
}
