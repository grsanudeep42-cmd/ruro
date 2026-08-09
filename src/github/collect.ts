import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";
import type { RuroConfig } from "../config.js";
import type { RepoSignals } from "../types.js";
import { withRetries } from "./retry.js";

export interface GithubClients {
  octokit: Octokit;
  gql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
}

export function createClients(token: string): GithubClients {
  const octokit = new Octokit({ auth: token, userAgent: "ruro/0.2" });
  const gqlClient = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
      "user-agent": "ruro/0.2",
    },
  });
  return {
    octokit,
    gql: <T>(query: string, variables?: Record<string, unknown>) =>
      withRetries(`graphql`, () => gqlClient(query, variables) as Promise<T>),
  };
}

/** Metadata + cadence + readme — structure flags come from the git tree. */
interface GraphqlRepo {
  name: string;
  nameWithOwner: string;
  url: string;
  description: string | null;
  homepageUrl: string | null;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  isTemplate: boolean;
  stargazerCount: number;
  forkCount: number;
  openIssues: { totalCount: number };
  hasIssuesEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  pushedAt: string | null;
  diskUsage: number;
  primaryLanguage: { name: string } | null;
  languages: { nodes: Array<{ name: string }> };
  repositoryTopics: { nodes: Array<{ topic: { name: string } }> };
  licenseInfo: { spdxId: string | null } | null;
  defaultBranchRef: {
    name: string;
    target: {
      history?: {
        totalCount?: number;
        nodes: Array<{
          committedDate: string;
          author?: { user?: { login: string } | null } | null;
        }>;
      };
    } | null;
  } | null;
  object: { text?: string } | null;
  licenseFile: { id: string } | null;
  releases: {
    totalCount: number;
    nodes: Array<{ publishedAt: string | null; createdAt: string }>;
  };
}

interface ReposQueryResult {
  repositoryOwner: {
    repositories: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: GraphqlRepo[];
    };
  } | null;
}

type RepoConnection = NonNullable<
  ReposQueryResult["repositoryOwner"]
>["repositories"];

const REPO_FIELDS = `
        name
        nameWithOwner
        url
        description
        homepageUrl
        isPrivate
        isFork
        isArchived
        isTemplate
        stargazerCount
        forkCount
        openIssues: issues(states: OPEN) { totalCount }
        hasIssuesEnabled
        createdAt
        updatedAt
        pushedAt
        diskUsage
        primaryLanguage { name }
        languages(first: 5, orderBy: { field: SIZE, direction: DESC }) {
          nodes { name }
        }
        repositoryTopics(first: 10) {
          nodes { topic { name } }
        }
        licenseInfo { spdxId }
        defaultBranchRef {
          name
          target {
            ... on Commit {
              history(first: 100) {
                totalCount
                nodes {
                  committedDate
                  author { user { login } }
                }
              }
            }
          }
        }
        object(expression: "HEAD:README.md") {
          ... on Blob { text }
        }
        licenseFile: object(expression: "HEAD:LICENSE") { ... on Blob { id } }
        releases(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) {
          totalCount
          nodes { publishedAt createdAt }
        }
`;

const REPOS_QUERY_ALL = `
query ($owner: String!, $cursor: String) {
  repositoryOwner(login: $owner) {
    repositories(
      first: 50
      after: $cursor
      ownerAffiliations: OWNER
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes { ${REPO_FIELDS} }
    }
  }
}
`;

const REPOS_QUERY_PUBLIC = `
query ($owner: String!, $cursor: String) {
  repositoryOwner(login: $owner) {
    repositories(
      first: 50
      after: $cursor
      privacy: PUBLIC
      ownerAffiliations: OWNER
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes { ${REPO_FIELDS} }
    }
  }
}
`;

function daysBetween(iso: string, now: Date): number {
  const t = new Date(iso).getTime();
  return Math.max(0, (now.getTime() - t) / (1000 * 60 * 60 * 24));
}

function countCommitsSince(
  dates: string[],
  now: Date,
  withinDays: number,
): number {
  return dates.filter((d) => daysBetween(d, now) <= withinDays).length;
}

function mapRepo(node: GraphqlRepo, now: Date, ownerLogin: string): RepoSignals {
  const history = node.defaultBranchRef?.target?.history;
  const commitDates = history?.nodes.map((n) => n.committedDate) ?? [];
  const readmeText = node.object?.text ?? null;

  const latestReleaseAt =
    node.releases.nodes[0]?.publishedAt ??
    node.releases.nodes[0]?.createdAt ??
    null;

  const authors = history?.nodes ?? [];
  let ownerShare: number | null = null;
  if (authors.length > 0) {
    const mine = authors.filter(
      (n) => n.author?.user?.login?.toLowerCase() === ownerLogin.toLowerCase(),
    ).length;
    ownerShare = Math.round((mine / authors.length) * 100);
  }

  // Prefer GraphQL totalCount for 365d ballpark when available (still capped sample for 30/90)
  const totalHint = history?.totalCount;
  const commits365 =
    totalHint != null && totalHint > commitDates.length
      ? Math.min(totalHint, countCommitsSince(commitDates, now, 365) + (totalHint - commitDates.length))
      : countCommitsSince(commitDates, now, 365);

  return {
    name: node.name,
    fullName: node.nameWithOwner,
    url: node.url,
    description: node.description,
    homepageUrl: node.homepageUrl || null,
    primaryLanguage: node.primaryLanguage?.name ?? null,
    languages: node.languages.nodes.map((l) => l.name),
    topics: node.repositoryTopics.nodes.map((t) => t.topic.name),
    isPrivate: node.isPrivate,
    isFork: node.isFork,
    isArchived: node.isArchived,
    isTemplate: node.isTemplate,
    licenseSpdx: node.licenseInfo?.spdxId ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    pushedAt: node.pushedAt,
    stars: node.stargazerCount,
    forks: node.forkCount,
    openIssues: node.openIssues.totalCount,
    hasIssuesEnabled: node.hasIssuesEnabled,
    defaultBranch: node.defaultBranchRef?.name ?? null,
    diskUsageKb: node.diskUsage ?? 0,
    readmeBytes: readmeText ? Buffer.byteLength(readmeText, "utf8") : null,
    hasLicenseFile: Boolean(node.licenseFile) || Boolean(node.licenseInfo),
    // Defaults — overwritten by tree classifiers when tree fetch succeeds
    hasWorkflows: false,
    hasDependabotConfig: false,
    hasCodeowners: false,
    hasTestsHeuristic: false,
    hasTestScript: false,
    hasLintConfigHeuristic: false,
    hasLockfile: false,
    hasPackageManifest: false,
    substantialCodebase: (node.diskUsage ?? 0) >= 200,
    hasSrcLayout: false,
    hasContainerfile: false,
    recentWorkflowConclusion: null,
    recentWorkflowAgeDays: null,
    ciConclusions: [],
    ownerCommitShare: ownerShare,
    commitsLast30Days: countCommitsSince(commitDates, now, 30),
    commitsLast90Days: countCommitsSince(commitDates, now, 90),
    commitsLast365Days: commits365,
    releasesCount: node.releases.totalCount,
    latestReleaseAt,
    demo: {
      status: "NONE",
      url: null,
      finalUrl: null,
      httpStatus: null,
      latencyMs: null,
      error: null,
      proofBytes: null,
      contentType: null,
      verified: false,
      redirectChain: [],
      bodyHash: null,
      spaShell: false,
      probedAt: null,
      hashStable: null,
    },
    fitness: {
      sourceFiles: 0,
      testFiles: 0,
      otherFiles: 0,
      maxBlobBytes: 0,
      score: 0,
      flags: ["pending"],
    },
  };
}

export async function collectRepoSignals(
  clients: GithubClients,
  config: RuroConfig,
): Promise<{ included: RepoSignals[]; excludedCount: number }> {
  const now = new Date();
  const exclude = new Set(
    config.scan.exclude_repos.map((r) => r.toLowerCase()),
  );
  const collected: RepoSignals[] = [];
  let excludedCount = 0;
  const query = config.scan.include_private ? REPOS_QUERY_ALL : REPOS_QUERY_PUBLIC;

  let cursor: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const data: ReposQueryResult = await clients.gql(query, {
      owner: config.owner,
      cursor,
    });
    const conn: RepoConnection | undefined = data.repositoryOwner?.repositories;
    if (!conn) {
      throw new Error(`Owner not found or inaccessible: ${config.owner}`);
    }

    for (const node of conn.nodes) {
      if (!config.scan.include_forks && node.isFork) {
        excludedCount += 1;
        continue;
      }
      if (!config.scan.include_archived && node.isArchived) {
        excludedCount += 1;
        continue;
      }
      if (exclude.has(node.name.toLowerCase())) {
        excludedCount += 1;
        continue;
      }
      if (!config.scan.include_private && node.isPrivate) {
        excludedCount += 1;
        continue;
      }
      collected.push(mapRepo(node, now, config.owner));
    }

    hasNext = conn.pageInfo.hasNextPage;
    cursor = conn.pageInfo.endCursor;
  }

  const { enrichCodeFitness } = await import("../fitness/code.js");
  await enrichCodeFitness(clients, collected);
  await enrichWorkflowSignals(clients, collected, now);
  return { included: collected, excludedCount };
}

async function enrichWorkflowSignals(
  clients: GithubClients,
  repos: RepoSignals[],
  now: Date,
): Promise<void> {
  for (const repo of repos) {
    if (!repo.hasWorkflows) continue;
    try {
      const [owner, name] = repo.fullName.split("/");
      const { data } = await withRetries(
        `actions:${repo.fullName}`,
        () =>
          clients.octokit.actions.listWorkflowRunsForRepo({
            owner,
            repo: name,
            per_page: 5,
            branch: repo.defaultBranch ?? undefined,
          }),
        { attempts: 3, baseDelayMs: 250 },
      );
      const runs = data.workflow_runs ?? [];
      if (!runs.length) continue;
      repo.ciConclusions = runs.map(
        (r) => r.conclusion ?? r.status ?? "unknown",
      );
      const run = runs[0];
      repo.recentWorkflowConclusion = run.conclusion ?? run.status ?? null;
      if (run.updated_at) {
        repo.recentWorkflowAgeDays = daysBetween(run.updated_at, now);
      }
    } catch {
      // Token may lack Actions read on some repos; skip quietly.
    }
  }
}
