export type RepoStatus =
  | "LIVE"
  | "ACTIVE"
  | "STALE"
  | "DORMANT"
  | "DEAD"
  | "ARCHIVED";

export type DemoStatus = "UP" | "DOWN" | "NONE" | "ERROR";

export interface DemoProbeResult {
  status: DemoStatus;
  url: string | null;
  /** URL after redirects */
  finalUrl: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  error: string | null;
  /** Response body size used as liveness proof */
  proofBytes: number | null;
  contentType: string | null;
  /** True only when probe proved a real deployment (not github.com/repo, not parking). */
  verified: boolean;
}

/** Deterministic without-AI code fitness from repo tree. */
export interface CodeFitness {
  sourceFiles: number;
  testFiles: number;
  otherFiles: number;
  maxBlobBytes: number;
  score: number;
  flags: string[];
}

export interface RepoSignals {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  homepageUrl: string | null;
  primaryLanguage: string | null;
  languages: string[];
  topics: string[];
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  isTemplate: boolean;
  licenseSpdx: string | null;
  createdAt: string;
  updatedAt: string;
  pushedAt: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  hasIssuesEnabled: boolean;
  defaultBranch: string | null;
  diskUsageKb: number;
  readmeBytes: number | null;
  hasLicenseFile: boolean;
  hasWorkflows: boolean;
  hasDependabotConfig: boolean;
  hasCodeowners: boolean;
  hasTestsHeuristic: boolean;
  hasTestScript: boolean;
  hasLintConfigHeuristic: boolean;
  hasLockfile: boolean;
  hasPackageManifest: boolean;
  substantialCodebase: boolean;
  hasSrcLayout: boolean;
  hasContainerfile: boolean;
  recentWorkflowConclusion: string | null;
  recentWorkflowAgeDays: number | null;
  commitsLast30Days: number;
  commitsLast90Days: number;
  commitsLast365Days: number;
  releasesCount: number;
  latestReleaseAt: string | null;
  demo: DemoProbeResult;
  fitness: CodeFitness;
}

export interface PillarBreakdown {
  quality: number;
  alive: number;
  structure: number;
}

export type ScorePillar = "quality" | "alive" | "structure";

/** Named feature delta — scores must be explainable contribution-by-contribution. */
export interface ScoreContribution {
  code: string;
  pillar: ScorePillar;
  delta: number;
}

export interface ScoredRepo {
  signals: RepoSignals;
  score: number;
  pillars: PillarBreakdown;
  status: RepoStatus;
  drivers: string[];
  blockers: string[];
  contributions: ScoreContribution[];
}

export interface RuroReport {
  schema_version: 1;
  generated_at: string;
  owner: string;
  repo_count: number;
  included_count: number;
  excluded_count: number;
  status_counts: Record<RepoStatus, number>;
  weights: PillarBreakdown;
  repos: ScoredRepo[];
  transitions: Array<{
    fullName: string;
    name: string;
    url: string;
    from: RepoStatus;
    to: RepoStatus;
    scoreFrom: number;
    scoreTo: number;
  }>;
}
