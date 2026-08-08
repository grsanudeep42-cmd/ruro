import type { RuroConfig } from "../config.js";
import type {
  PillarBreakdown,
  RepoSignals,
  RepoStatus,
  ScoredRepo,
} from "../types.js";

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

function scoreQuality(s: RepoSignals): { score: number; drivers: string[]; blockers: string[] } {
  let score = 18;
  const drivers: string[] = [];
  const blockers: string[] = [];

  if (s.hasPackageManifest) {
    score += 8;
    drivers.push("manifest");
  }

  if (s.substantialCodebase) {
    score += 10;
    drivers.push("substantial_code");
  }

  if (s.hasTestsHeuristic) {
    score += 20;
    drivers.push("tests_present");
    if (s.hasTestScript) {
      score += 4;
      drivers.push("test_script");
    }
  } else {
    blockers.push("no_tests_detected");
  }

  if (s.hasWorkflows) {
    score += 12;
    drivers.push("ci_workflows");
  } else {
    blockers.push("no_ci");
  }

  if (s.recentWorkflowConclusion === "success") {
    score += 12;
    drivers.push("ci_green");
  } else if (s.recentWorkflowConclusion === "failure") {
    score -= 8;
    blockers.push("ci_failing");
  }

  if (s.hasLintConfigHeuristic) {
    score += 10;
    drivers.push("lint_config");
  }

  if (s.hasDependabotConfig) {
    score += 8;
    drivers.push("dependabot");
  }

  if (s.hasLockfile) {
    score += 6;
    drivers.push("lockfile");
  }

  if (s.hasCodeowners) {
    score += 4;
    drivers.push("codeowners");
  }

  if (s.diskUsageKb > 0 && s.diskUsageKb < 40 && !s.hasTestsHeuristic) {
    score -= 15;
    blockers.push("stub_sized");
  }

  if (!s.primaryLanguage && s.diskUsageKb < 80) {
    score -= 10;
    blockers.push("no_language");
  }

  return { score: clamp(score), drivers, blockers };
}

function scoreAlive(
  s: RepoSignals,
  thresholds: RuroConfig["thresholds"],
): { score: number; drivers: string[]; blockers: string[] } {
  let score = 0;
  const drivers: string[] = [];
  const blockers: string[] = [];
  const now = new Date();
  const pushAge = daysSince(s.pushedAt, now);

  if (s.demo.status === "UP") {
    score += 35;
    drivers.push("demo_up");
  } else if (s.demo.status === "DOWN" || s.demo.status === "ERROR") {
    score -= 10;
    blockers.push("demo_down");
  }

  if (pushAge === null) {
    blockers.push("never_pushed");
  } else if (pushAge <= 14) {
    score += 30;
    drivers.push("pushed_2w");
  } else if (pushAge <= thresholds.active_days) {
    score += 22;
    drivers.push("pushed_active_window");
  } else if (pushAge <= thresholds.stale_days) {
    score += 12;
  } else if (pushAge <= thresholds.dormant_days) {
    score += 5;
    blockers.push("quiet_long");
  } else {
    blockers.push("very_quiet");
  }

  if (s.commitsLast30Days >= 5) {
    score += 15;
    drivers.push("high_cadence_30d");
  } else if (s.commitsLast30Days >= 1) {
    score += 8;
    drivers.push("cadence_30d");
  } else if (s.commitsLast90Days >= 3) {
    score += 5;
  }

  if (s.releasesCount > 0) {
    score += 8;
    drivers.push("has_releases");
    const releaseAge = daysSince(s.latestReleaseAt, now);
    if (releaseAge !== null && releaseAge <= 180) {
      score += 5;
      drivers.push("recent_release");
    }
  }

  if (
    s.recentWorkflowConclusion === "success" &&
    s.recentWorkflowAgeDays !== null &&
    s.recentWorkflowAgeDays <= 30
  ) {
    score += 7;
    drivers.push("ci_fresh");
  }

  return { score: clamp(score), drivers, blockers };
}

function scoreStructure(s: RepoSignals): {
  score: number;
  drivers: string[];
  blockers: string[];
} {
  let score = 15;
  const drivers: string[] = [];
  const blockers: string[] = [];

  if (s.description && s.description.trim().length >= 20) {
    score += 12;
    drivers.push("description");
  } else {
    blockers.push("weak_description");
  }

  if (s.readmeBytes !== null && s.readmeBytes >= 800) {
    score += 20;
    drivers.push("readme_substance");
  } else if (s.readmeBytes !== null && s.readmeBytes >= 200) {
    score += 10;
    drivers.push("readme_basic");
  } else {
    blockers.push("thin_readme");
  }

  if (s.hasLicenseFile || s.licenseSpdx) {
    score += 15;
    drivers.push("license");
  } else {
    blockers.push("no_license");
  }

  if (s.topics.length >= 3) {
    score += 8;
    drivers.push("topics");
  } else if (s.topics.length === 0) {
    blockers.push("no_topics");
  }

  if (s.homepageUrl) {
    score += 10;
    drivers.push("homepage_set");
  }

  if (s.primaryLanguage) {
    score += 8;
  }

  if (s.isFork) {
    score -= 20;
    blockers.push("fork");
  }

  return { score: clamp(score), drivers, blockers };
}

export function deriveStatus(
  s: RepoSignals,
  thresholds: RuroConfig["thresholds"],
): RepoStatus {
  if (s.isArchived) return "ARCHIVED";

  const pushAge = daysSince(s.pushedAt, new Date());
  const demoUp = s.demo.status === "UP";

  if (demoUp && (pushAge === null || pushAge <= thresholds.dormant_days)) {
    return "LIVE";
  }

  if (pushAge !== null && pushAge <= thresholds.active_days) {
    return demoUp ? "LIVE" : "ACTIVE";
  }
  if (pushAge !== null && pushAge <= thresholds.stale_days) return "STALE";
  if (pushAge !== null && pushAge <= thresholds.dormant_days) return "DORMANT";
  return "DEAD";
}

export function scoreRepo(s: RepoSignals, config: RuroConfig): ScoredRepo {
  const q = scoreQuality(s);
  const a = scoreAlive(s, config.thresholds);
  const st = scoreStructure(s);

  const pillars: PillarBreakdown = {
    quality: q.score,
    alive: a.score,
    structure: st.score,
  };

  const score = clamp(
    config.weights.quality * pillars.quality +
      config.weights.alive * pillars.alive +
      config.weights.structure * pillars.structure,
  );

  // Prefer liveness drivers first — they explain LIVE/DEAD at a glance.
  const drivers = [
    ...new Set([...a.drivers, ...q.drivers, ...st.drivers]),
  ].slice(0, 10);
  const blockers = [
    ...new Set([...a.blockers, ...q.blockers, ...st.blockers]),
  ].slice(0, 10);

  return {
    signals: s,
    score,
    pillars,
    status: deriveStatus(s, config.thresholds),
    drivers,
    blockers,
  };
}

export function scoreAll(signals: RepoSignals[], config: RuroConfig): ScoredRepo[] {
  return signals
    .map((s) => scoreRepo(s, config))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.signals.fullName.localeCompare(b.signals.fullName);
    });
}
