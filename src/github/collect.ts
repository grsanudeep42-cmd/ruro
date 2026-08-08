import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";
import type { RuroConfig } from "../config.js";
import type { RepoSignals } from "../types.js";

export interface GithubClients {
  octokit: Octokit;
  gql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
}

export function createClients(token: string): GithubClients {
  const octokit = new Octokit({ auth: token, userAgent: "ruro/0.1" });
  const gqlClient = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
      "user-agent": "ruro/0.1",
    },
  });
  return {
    octokit,
    gql: <T>(query: string, variables?: Record<string, unknown>) =>
      gqlClient(query, variables) as Promise<T>,
  };
}

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
        nodes: Array<{ committedDate: string }>;
      };
    } | null;
  } | null;
  object: { text?: string } | null;
  licenseFile: { id: string } | null;
  workflows: { entries: Array<{ name: string; type: string }> | null } | null;
  dependabotYml: { id: string } | null;
  dependabotYaml: { id: string } | null;
  codeowners: { id: string } | null;
  packageJson: { text?: string; id?: string } | null;
  cargoToml: { id: string } | null;
  goMod: { id: string } | null;
  pyproject: { text?: string; id?: string } | null;
  requirements: { id: string } | null;
  eslintJs: { id: string } | null;
  eslintCjs: { id: string } | null;
  eslintrcJson: { id: string } | null;
  ruffToml: { id: string } | null;
  prettierrc: { id: string } | null;
  vitestConfig: { id: string } | null;
  jestConfig: { id: string } | null;
  packageLock: { id: string } | null;
  yarnLock: { id: string } | null;
  pnpmLock: { id: string } | null;
  poetryLock: { id: string } | null;
  testDir: { id: string } | null;
  testsDir: { id: string } | null;
  srcTestDir: { id: string } | null;
  underscoreTests: { id: string } | null;
  specDir: { id: string } | null;
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
                nodes { committedDate }
              }
            }
          }
        }
        object(expression: "HEAD:README.md") {
          ... on Blob { text }
        }
        licenseFile: object(expression: "HEAD:LICENSE") { ... on Blob { id } }
        workflows: object(expression: "HEAD:.github/workflows") {
          ... on Tree { entries { name type } }
        }
        dependabotYml: object(expression: "HEAD:.github/dependabot.yml") { ... on Blob { id } }
        dependabotYaml: object(expression: "HEAD:.github/dependabot.yaml") { ... on Blob { id } }
        codeowners: object(expression: "HEAD:.github/CODEOWNERS") { ... on Blob { id } }
        packageJson: object(expression: "HEAD:package.json") { ... on Blob { text id } }
        cargoToml: object(expression: "HEAD:Cargo.toml") { ... on Blob { id } }
        goMod: object(expression: "HEAD:go.mod") { ... on Blob { id } }
        pyproject: object(expression: "HEAD:pyproject.toml") { ... on Blob { text id } }
        requirements: object(expression: "HEAD:requirements.txt") { ... on Blob { id } }
        eslintJs: object(expression: "HEAD:eslint.config.js") { ... on Blob { id } }
        eslintCjs: object(expression: "HEAD:eslint.config.cjs") { ... on Blob { id } }
        eslintrcJson: object(expression: "HEAD:.eslintrc.json") { ... on Blob { id } }
        ruffToml: object(expression: "HEAD:ruff.toml") { ... on Blob { id } }
        prettierrc: object(expression: "HEAD:.prettierrc") { ... on Blob { id } }
        vitestConfig: object(expression: "HEAD:vitest.config.ts") { ... on Blob { id } }
        jestConfig: object(expression: "HEAD:jest.config.js") { ... on Blob { id } }
        packageLock: object(expression: "HEAD:package-lock.json") { ... on Blob { id } }
        yarnLock: object(expression: "HEAD:yarn.lock") { ... on Blob { id } }
        pnpmLock: object(expression: "HEAD:pnpm-lock.yaml") { ... on Blob { id } }
        poetryLock: object(expression: "HEAD:poetry.lock") { ... on Blob { id } }
        testDir: object(expression: "HEAD:test") { ... on Tree { id } }
        testsDir: object(expression: "HEAD:tests") { ... on Tree { id } }
        srcTestDir: object(expression: "HEAD:src/__tests__") { ... on Tree { id } }
        underscoreTests: object(expression: "HEAD:__tests__") { ... on Tree { id } }
        specDir: object(expression: "HEAD:spec") { ... on Tree { id } }
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

function detectTestScript(
  packageJsonText: string | undefined,
  pyprojectText: string | undefined,
): boolean {
  if (packageJsonText) {
    try {
      const pkg = JSON.parse(packageJsonText) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      };
      const scripts = Object.values(pkg.scripts ?? {}).join(" ").toLowerCase();
      if (/\b(test|vitest|jest|mocha|pytest|playwright|cypress)\b/.test(scripts)) {
        return true;
      }
      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
      if (
        ["vitest", "jest", "mocha", "@playwright/test", "cypress"].some(
          (d) => d in deps,
        )
      ) {
        return true;
      }
    } catch {
      // ignore malformed package.json
    }
  }
  if (pyprojectText) {
    const lower = pyprojectText.toLowerCase();
    if (
      lower.includes("pytest") ||
      lower.includes("unittest") ||
      /\[tool\.pytest/.test(lower)
    ) {
      return true;
    }
  }
  return false;
}

function mapRepo(node: GraphqlRepo, now: Date): RepoSignals {
  const commitDates =
    node.defaultBranchRef?.target?.history?.nodes.map((n) => n.committedDate) ??
    [];
  const readmeText = node.object?.text ?? null;
  const workflowEntries = node.workflows?.entries ?? [];
  const hasWorkflows = workflowEntries.some(
    (e) => e.type === "blob" && /\.ya?ml$/i.test(e.name),
  );

  const latestReleaseAt =
    node.releases.nodes[0]?.publishedAt ??
    node.releases.nodes[0]?.createdAt ??
    null;

  const hasTestScript = detectTestScript(
    node.packageJson?.text,
    node.pyproject?.text,
  );
  const hasTestsHeuristic = Boolean(
    node.testDir ||
      node.testsDir ||
      node.srcTestDir ||
      node.underscoreTests ||
      node.specDir ||
      node.vitestConfig ||
      node.jestConfig ||
      hasTestScript,
  );
  const hasPackageManifest = Boolean(
    node.packageJson ||
      node.pyproject ||
      node.requirements ||
      node.goMod ||
      node.cargoToml,
  );

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
    hasWorkflows,
    hasDependabotConfig: Boolean(node.dependabotYml || node.dependabotYaml),
    hasCodeowners: Boolean(node.codeowners),
    hasTestsHeuristic,
    hasTestScript,
    hasLintConfigHeuristic: Boolean(
      node.eslintJs ||
        node.eslintCjs ||
        node.eslintrcJson ||
        node.ruffToml ||
        node.prettierrc,
    ),
    hasLockfile: Boolean(
      node.packageLock || node.yarnLock || node.pnpmLock || node.poetryLock,
    ),
    hasPackageManifest,
    substantialCodebase: (node.diskUsage ?? 0) >= 200,
    recentWorkflowConclusion: null,
    recentWorkflowAgeDays: null,
    commitsLast30Days: countCommitsSince(commitDates, now, 30),
    commitsLast90Days: countCommitsSince(commitDates, now, 90),
    commitsLast365Days: countCommitsSince(commitDates, now, 365),
    releasesCount: node.releases.totalCount,
    latestReleaseAt,
    demo: {
      status: "NONE",
      url: null,
      httpStatus: null,
      latencyMs: null,
      error: null,
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
      collected.push(mapRepo(node, now));
    }

    hasNext = conn.pageInfo.hasNextPage;
    cursor = conn.pageInfo.endCursor;
  }

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
      const { data } = await clients.octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo: name,
        per_page: 1,
        branch: repo.defaultBranch ?? undefined,
      });
      const run = data.workflow_runs[0];
      if (!run) continue;
      repo.recentWorkflowConclusion = run.conclusion ?? run.status ?? null;
      if (run.updated_at) {
        repo.recentWorkflowAgeDays = daysBetween(run.updated_at, now);
      }
    } catch {
      // Token may lack Actions read on some repos; skip quietly.
    }
  }
}
