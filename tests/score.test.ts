import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { deriveStatus, scoreRepo } from "../src/score/score.js";
import type { RepoSignals } from "../src/types.js";

function baseSignals(over: Partial<RepoSignals> = {}): RepoSignals {
  const now = new Date();
  return {
    name: "demo",
    fullName: "acme/demo",
    url: "https://github.com/acme/demo",
    description: "A solid demonstration application with real users.",
    homepageUrl: "https://example.com",
    primaryLanguage: "TypeScript",
    languages: ["TypeScript"],
    topics: ["portfolio", "web", "typescript"],
    isPrivate: false,
    isFork: false,
    isArchived: false,
    isTemplate: false,
    licenseSpdx: "MIT",
    createdAt: new Date(now.getTime() - 864e5 * 400).toISOString(),
    updatedAt: now.toISOString(),
    pushedAt: now.toISOString(),
    stars: 3,
    forks: 0,
    openIssues: 1,
    hasIssuesEnabled: true,
    defaultBranch: "main",
    diskUsageKb: 1200,
    readmeBytes: 2400,
    hasLicenseFile: true,
    hasWorkflows: true,
    hasDependabotConfig: true,
    hasCodeowners: false,
    hasTestsHeuristic: true,
    hasTestScript: true,
    hasLintConfigHeuristic: true,
    hasLockfile: true,
    hasPackageManifest: true,
    substantialCodebase: true,
  hasSrcLayout: true,
  hasContainerfile: false,
    recentWorkflowConclusion: "success",
    recentWorkflowAgeDays: 2,
    commitsLast30Days: 8,
    commitsLast90Days: 20,
    commitsLast365Days: 40,
    releasesCount: 2,
    latestReleaseAt: new Date(now.getTime() - 864e5 * 20).toISOString(),
    demo: {
      status: "UP",
      url: "https://example.com",
      httpStatus: 200,
      latencyMs: 120,
      error: null,
    },
    ...over,
  };
}

describe("scoreRepo", () => {
  const config = defaultConfig("acme");

  it("scores a healthy live repo highly and deterministically", () => {
    const a = scoreRepo(baseSignals(), config);
    const b = scoreRepo(baseSignals(), config);
    expect(a.score).toBe(b.score);
    expect(a.score).toBeGreaterThanOrEqual(75);
    expect(a.status).toBe("LIVE");
    expect(a.drivers).toContain("demo_up");
    expect(a.drivers).toContain("tests_present");
  });

  it("penalizes abandoned repos without demos or tests", () => {
    const abandoned = scoreRepo(
      baseSignals({
        pushedAt: new Date(Date.now() - 864e5 * 500).toISOString(),
        commitsLast30Days: 0,
        commitsLast90Days: 0,
        commitsLast365Days: 0,
        hasTestsHeuristic: false,
        hasTestScript: false,
        hasWorkflows: false,
        hasLintConfigHeuristic: false,
        hasDependabotConfig: false,
        hasPackageManifest: false,
        substantialCodebase: false,
      hasSrcLayout: false,
      hasContainerfile: false,
        readmeBytes: 40,
        description: "tmp",
        topics: [],
        homepageUrl: null,
        demo: {
          status: "NONE",
          url: null,
          httpStatus: null,
          latencyMs: null,
          error: null,
        },
        recentWorkflowConclusion: null,
        recentWorkflowAgeDays: null,
        releasesCount: 0,
        latestReleaseAt: null,
        diskUsageKb: 20,
      }),
      config,
    );
    expect(abandoned.score).toBeLessThan(45);
    expect(abandoned.status).toBe("DEAD");
  });
});

describe("deriveStatus", () => {
  const thresholds = defaultConfig("acme").thresholds;

  it("marks archived regardless of activity", () => {
    expect(
      deriveStatus(baseSignals({ isArchived: true }), thresholds),
    ).toBe("ARCHIVED");
  });

  it("marks LIVE when demo is up", () => {
    expect(deriveStatus(baseSignals(), thresholds)).toBe("LIVE");
  });
});
