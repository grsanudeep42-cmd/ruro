import { describe, expect, it } from "vitest";
import { computeTransitions } from "../src/history/transitions.js";
import type { RuroReport, ScoredRepo } from "../src/types.js";

function stubRepo(
  name: string,
  status: ScoredRepo["status"],
  score: number,
): ScoredRepo {
  return {
    score,
    status,
    pillars: { quality: score, alive: score, structure: score },
    drivers: [],
    blockers: [],
    signals: {
      name,
      fullName: `acme/${name}`,
      url: `https://github.com/acme/${name}`,
      description: null,
      homepageUrl: null,
      primaryLanguage: "TypeScript",
      languages: ["TypeScript"],
      topics: [],
      isPrivate: false,
      isFork: false,
      isArchived: false,
      isTemplate: false,
      licenseSpdx: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      pushedAt: "2026-08-01T00:00:00.000Z",
      stars: 0,
      forks: 0,
      openIssues: 0,
      hasIssuesEnabled: true,
      defaultBranch: "main",
      diskUsageKb: 100,
      readmeBytes: 100,
      hasLicenseFile: false,
      hasWorkflows: false,
      hasDependabotConfig: false,
      hasCodeowners: false,
      hasTestsHeuristic: false,
      hasTestScript: false,
      hasLintConfigHeuristic: false,
      hasLockfile: false,
      hasPackageManifest: true,
      substantialCodebase: false,
      recentWorkflowConclusion: null,
      recentWorkflowAgeDays: null,
      commitsLast30Days: 0,
      commitsLast90Days: 0,
      commitsLast365Days: 0,
      releasesCount: 0,
      latestReleaseAt: null,
      demo: {
        status: "NONE",
        url: null,
        httpStatus: null,
        latencyMs: null,
        error: null,
      },
    },
  };
}

function stubReport(repos: ScoredRepo[]): RuroReport {
  return {
    schema_version: 1,
    generated_at: "2026-08-08T00:00:00.000Z",
    owner: "acme",
    repo_count: repos.length,
    included_count: repos.length,
    excluded_count: 0,
    status_counts: {
      LIVE: 0,
      ACTIVE: 0,
      STALE: 0,
      DORMANT: 0,
      DEAD: 0,
      ARCHIVED: 0,
    },
    weights: { quality: 0.4, alive: 0.35, structure: 0.25 },
    repos,
    transitions: [],
  };
}

describe("computeTransitions", () => {
  it("returns empty when there is no previous report", () => {
    expect(computeTransitions(null, stubReport([stubRepo("a", "LIVE", 80)]))).toEqual(
      [],
    );
  });

  it("detects status changes only", () => {
    const prev = stubReport([
      stubRepo("alpha", "ACTIVE", 40),
      stubRepo("beta", "LIVE", 70),
    ]);
    const next = stubReport([
      stubRepo("alpha", "STALE", 30),
      stubRepo("beta", "LIVE", 72),
    ]);
    const transitions = computeTransitions(prev, next);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      name: "alpha",
      from: "ACTIVE",
      to: "STALE",
      scoreFrom: 40,
      scoreTo: 30,
    });
  });
});
