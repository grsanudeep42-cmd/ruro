import type { CodeFitness, DemoProbeResult, RepoSignals } from "../src/types.js";

export function emptyDemo(
  patch: Partial<DemoProbeResult> = {},
): DemoProbeResult {
  return {
    status: "NONE",
    url: null,
    finalUrl: null,
    httpStatus: null,
    latencyMs: null,
    error: null,
    proofBytes: null,
    contentType: null,
    verified: false,
    ...patch,
  };
}

export function emptyFitness(patch: Partial<CodeFitness> = {}): CodeFitness {
  return {
    sourceFiles: 8,
    testFiles: 2,
    otherFiles: 4,
    maxBlobBytes: 12_000,
    score: 72,
    flags: ["has_source", "has_test_files", "healthy_test_ratio"],
    ...patch,
  };
}

export function baseSignals(patch: Partial<RepoSignals> = {}): RepoSignals {
  return {
    name: "alpha",
    fullName: "acme/alpha",
    url: "https://github.com/acme/alpha",
    description: "Alpha service used in production by real customers daily.",
    homepageUrl: "https://alpha.example.com",
    primaryLanguage: "Go",
    languages: ["Go"],
    topics: ["api", "go"],
    isPrivate: false,
    isFork: false,
    isArchived: false,
    isTemplate: false,
    licenseSpdx: "Apache-2.0",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    pushedAt: "2026-08-01T00:00:00.000Z",
    stars: 1,
    forks: 0,
    openIssues: 0,
    hasIssuesEnabled: true,
    defaultBranch: "main",
    diskUsageKb: 900,
    readmeBytes: 1200,
    hasLicenseFile: true,
    hasWorkflows: true,
    hasDependabotConfig: false,
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
    recentWorkflowAgeDays: 3,
    commitsLast30Days: 4,
    commitsLast90Days: 10,
    commitsLast365Days: 30,
    releasesCount: 1,
    latestReleaseAt: "2026-07-01T00:00:00.000Z",
    demo: emptyDemo({
      status: "UP",
      url: "https://alpha.example.com",
      finalUrl: "https://alpha.example.com",
      httpStatus: 200,
      latencyMs: 80,
      proofBytes: 2400,
      contentType: "text/html",
      verified: true,
    }),
    fitness: emptyFitness(),
    ...patch,
  };
}
