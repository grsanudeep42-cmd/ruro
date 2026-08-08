// src/index.ts
import * as core from "@actions/core";
import * as github from "@actions/github";

// src/config.ts
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
var WeightsSchema = z.object({
  quality: z.number().min(0).max(1),
  alive: z.number().min(0).max(1),
  structure: z.number().min(0).max(1)
}).refine(
  (w) => Math.abs(w.quality + w.alive + w.structure - 1) < 1e-6,
  "weights must sum to 1"
);
var ConfigSchema = z.object({
  schema_version: z.literal(1),
  owner: z.string().min(1),
  scan: z.object({
    include_private: z.boolean().default(true),
    include_forks: z.boolean().default(false),
    include_archived: z.boolean().default(true),
    exclude_repos: z.array(z.string()).default([])
  }),
  weights: WeightsSchema,
  thresholds: z.object({
    active_days: z.number().int().positive(),
    stale_days: z.number().int().positive(),
    dormant_days: z.number().int().positive()
  }),
  probes: z.object({
    enabled: z.boolean().default(true),
    timeout_ms: z.number().int().positive().default(8e3),
    user_agent: z.string().default("ruro-probe/0.1"),
    follow_redirects: z.boolean().default(true)
  }),
  render: z.object({
    dashboard_path: z.string().default("DASHBOARD.md"),
    data_path: z.string().default("data/latest.json"),
    history: z.boolean().default(true),
    history_dir: z.string().default("data/history"),
    title: z.string().default("Ruro Portfolio Scorecard")
  }),
  privacy: z.object({
    mode: z.enum(["full", "public_only_render"]).default("full")
  }).default({ mode: "full" })
});
function loadConfig(path, ownerOverride) {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    throw new Error(`Config not found: ${abs}`);
  }
  const raw = yaml.load(readFileSync(abs, "utf8"));
  const parsed = ConfigSchema.parse(raw);
  if (ownerOverride?.trim()) {
    return { ...parsed, owner: ownerOverride.trim() };
  }
  return parsed;
}

// src/run.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolve2 } from "node:path";

// src/github/collect.ts
import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";
function createClients(token) {
  const octokit = new Octokit({ auth: token, userAgent: "ruro/0.1" });
  const gqlClient = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
      "user-agent": "ruro/0.1"
    }
  });
  return {
    octokit,
    gql: (query, variables) => gqlClient(query, variables)
  };
}
var REPO_FIELDS = `
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
var REPOS_QUERY_ALL = `
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
var REPOS_QUERY_PUBLIC = `
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
function daysBetween(iso, now) {
  const t = new Date(iso).getTime();
  return Math.max(0, (now.getTime() - t) / (1e3 * 60 * 60 * 24));
}
function countCommitsSince(dates, now, withinDays) {
  return dates.filter((d) => daysBetween(d, now) <= withinDays).length;
}
function detectTestScript(packageJsonText, pyprojectText) {
  if (packageJsonText) {
    try {
      const pkg = JSON.parse(packageJsonText);
      const scripts = Object.values(pkg.scripts ?? {}).join(" ").toLowerCase();
      if (/\b(test|vitest|jest|mocha|pytest|playwright|cypress)\b/.test(scripts)) {
        return true;
      }
      const deps = {
        ...pkg.dependencies ?? {},
        ...pkg.devDependencies ?? {}
      };
      if (["vitest", "jest", "mocha", "@playwright/test", "cypress"].some(
        (d) => d in deps
      )) {
        return true;
      }
    } catch {
    }
  }
  if (pyprojectText) {
    const lower = pyprojectText.toLowerCase();
    if (lower.includes("pytest") || lower.includes("unittest") || /\[tool\.pytest/.test(lower)) {
      return true;
    }
  }
  return false;
}
function mapRepo(node, now) {
  const commitDates = node.defaultBranchRef?.target?.history?.nodes.map((n) => n.committedDate) ?? [];
  const readmeText = node.object?.text ?? null;
  const workflowEntries = node.workflows?.entries ?? [];
  const hasWorkflows = workflowEntries.some(
    (e) => e.type === "blob" && /\.ya?ml$/i.test(e.name)
  );
  const latestReleaseAt = node.releases.nodes[0]?.publishedAt ?? node.releases.nodes[0]?.createdAt ?? null;
  const hasTestScript = detectTestScript(
    node.packageJson?.text,
    node.pyproject?.text
  );
  const hasTestsHeuristic = Boolean(
    node.testDir || node.testsDir || node.srcTestDir || node.underscoreTests || node.specDir || node.vitestConfig || node.jestConfig || hasTestScript
  );
  const hasPackageManifest = Boolean(
    node.packageJson || node.pyproject || node.requirements || node.goMod || node.cargoToml
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
      node.eslintJs || node.eslintCjs || node.eslintrcJson || node.ruffToml || node.prettierrc
    ),
    hasLockfile: Boolean(
      node.packageLock || node.yarnLock || node.pnpmLock || node.poetryLock
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
      error: null
    }
  };
}
async function collectRepoSignals(clients, config) {
  const now = /* @__PURE__ */ new Date();
  const exclude = new Set(
    config.scan.exclude_repos.map((r) => r.toLowerCase())
  );
  const collected = [];
  let excludedCount = 0;
  const query = config.scan.include_private ? REPOS_QUERY_ALL : REPOS_QUERY_PUBLIC;
  let cursor = null;
  let hasNext = true;
  while (hasNext) {
    const data = await clients.gql(query, {
      owner: config.owner,
      cursor
    });
    const conn = data.repositoryOwner?.repositories;
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
async function enrichWorkflowSignals(clients, repos, now) {
  for (const repo of repos) {
    if (!repo.hasWorkflows) continue;
    try {
      const [owner, name] = repo.fullName.split("/");
      const { data } = await clients.octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo: name,
        per_page: 1,
        branch: repo.defaultBranch ?? void 0
      });
      const run = data.workflow_runs[0];
      if (!run) continue;
      repo.recentWorkflowConclusion = run.conclusion ?? run.status ?? null;
      if (run.updated_at) {
        repo.recentWorkflowAgeDays = daysBetween(run.updated_at, now);
      }
    } catch {
    }
  }
}

// src/probes/demo.ts
function normalizeUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
async function probeDemoUrl(homepageUrl, config) {
  if (!config.probes.enabled) {
    return {
      status: homepageUrl ? "NONE" : "NONE",
      url: homepageUrl ?? null,
      httpStatus: null,
      latencyMs: null,
      error: null
    };
  }
  const url = homepageUrl ? normalizeUrl(homepageUrl) : null;
  if (!url) {
    return {
      status: "NONE",
      url: null,
      httpStatus: null,
      latencyMs: null,
      error: null
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.probes.timeout_ms);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: config.probes.follow_redirects ? "follow" : "manual",
      signal: controller.signal,
      headers: {
        "user-agent": config.probes.user_agent,
        accept: "text/html,application/json;q=0.9,*/*;q=0.8"
      }
    });
    const latencyMs = Date.now() - started;
    const ok = response.status >= 200 && response.status < 400;
    return {
      status: ok ? "UP" : "DOWN",
      url,
      httpStatus: response.status,
      latencyMs,
      error: ok ? null : `HTTP ${response.status}`
    };
  } catch (err) {
    return {
      status: "ERROR",
      url,
      httpStatus: null,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err)
    };
  } finally {
    clearTimeout(timer);
  }
}
async function probeAll(homepageUrls, config, concurrency = 6) {
  const results = new Array(homepageUrls.length);
  let index = 0;
  async function worker() {
    while (index < homepageUrls.length) {
      const current = index;
      index += 1;
      results[current] = await probeDemoUrl(homepageUrls[current], config);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, homepageUrls.length)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// src/render/dashboard.ts
function relativeDays(iso) {
  if (!iso) return "\u2014";
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 864e5
  );
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
function esc(text) {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
function statusCounts(repos) {
  const counts = {
    LIVE: 0,
    ACTIVE: 0,
    STALE: 0,
    DORMANT: 0,
    DEAD: 0,
    ARCHIVED: 0
  };
  for (const r of repos) counts[r.status] += 1;
  return counts;
}
function buildReport(config, repos, excludedCount) {
  const visible = config.privacy.mode === "public_only_render" ? repos.filter((r) => !r.signals.isPrivate) : repos;
  return {
    schema_version: 1,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    owner: config.owner,
    repo_count: repos.length + excludedCount,
    included_count: visible.length,
    excluded_count: excludedCount + (repos.length - visible.length),
    status_counts: statusCounts(visible),
    weights: { ...config.weights },
    repos: visible
  };
}
function renderDashboard(report, config) {
  const top = report.repos.slice(0, 3);
  const counts = Object.entries(report.status_counts).filter(([, n]) => n > 0).map(([k, n]) => `**${k}** ${n}`).join(" \xB7 ");
  const lines = [
    `# ${config.render.title}`,
    "",
    `> Generated by **Ruro** \xB7 ${report.generated_at} \xB7 owner \`${report.owner}\``,
    ">",
    "> Deterministic portfolio scorecard. Zero AI. Data never leaves GitHub.",
    "",
    "## Snapshot",
    "",
    `- Scanned / included / excluded: **${report.repo_count}** / **${report.included_count}** / **${report.excluded_count}**`,
    `- Weights: quality \`${report.weights.quality}\` \xB7 alive \`${report.weights.alive}\` \xB7 structure \`${report.weights.structure}\``,
    `- Status mix: ${counts || "\u2014"}`,
    "",
    "## Top 3",
    ""
  ];
  if (top.length === 0) {
    lines.push("_No repositories scored._", "");
  } else {
    for (let i = 0; i < top.length; i += 1) {
      const r = top[i];
      lines.push(
        `${i + 1}. **[${r.signals.name}](${r.signals.url})** \u2014 \`${r.status}\` \xB7 score **${r.score}** \xB7 ${r.drivers.slice(0, 3).join(", ") || "\u2014"}`
      );
    }
    lines.push("");
  }
  lines.push(
    "## All projects",
    "",
    "| Rank | Repo | Status | Score | Quality | Alive | Structure | Demo | Last push | Stack | Notes |",
    "| ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |"
  );
  report.repos.forEach((r, idx) => {
    const notes = [
      ...r.drivers.slice(0, 2),
      ...r.blockers.slice(0, 2).map((b) => `!${b}`)
    ].join(", ").slice(0, 80);
    const stack = r.signals.primaryLanguage ?? "\u2014";
    lines.push(
      `| ${idx + 1} | [${esc(r.signals.name)}](${r.signals.url}) | \`${r.status}\` | **${r.score}** | ${r.pillars.quality} | ${r.pillars.alive} | ${r.pillars.structure} | \`${r.signals.demo.status}\` | ${relativeDays(r.signals.pushedAt)} | ${esc(stack)} | ${esc(notes || "\u2014")} |`
    );
  });
  lines.push(
    "",
    "## Legend",
    "",
    "- **Score** = `0.40*Quality + 0.35*Alive + 0.25*Structure` (configurable)",
    "- **Status**: `LIVE` demo up \xB7 `ACTIVE` recent pushes \xB7 `STALE`/`DORMANT` quiet \xB7 `DEAD` abandoned \xB7 `ARCHIVED`",
    "- **Demo**: `UP`/`DOWN`/`NONE`/`ERROR` from homepage probe",
    "- Notes prefixed with `!` are blockers",
    "",
    "---",
    "_Ruro does not use AI. Same inputs \u21D2 same scores._",
    ""
  );
  return lines.join("\n");
}

// src/score/score.ts
function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}
function daysSince(iso, now) {
  if (!iso) return null;
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / 864e5);
}
function scoreQuality(s) {
  let score = 18;
  const drivers = [];
  const blockers = [];
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
function scoreAlive(s, thresholds) {
  let score = 0;
  const drivers = [];
  const blockers = [];
  const now = /* @__PURE__ */ new Date();
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
  if (s.recentWorkflowConclusion === "success" && s.recentWorkflowAgeDays !== null && s.recentWorkflowAgeDays <= 30) {
    score += 7;
    drivers.push("ci_fresh");
  }
  return { score: clamp(score), drivers, blockers };
}
function scoreStructure(s) {
  let score = 15;
  const drivers = [];
  const blockers = [];
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
function deriveStatus(s, thresholds) {
  if (s.isArchived) return "ARCHIVED";
  const pushAge = daysSince(s.pushedAt, /* @__PURE__ */ new Date());
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
function scoreRepo(s, config) {
  const q = scoreQuality(s);
  const a = scoreAlive(s, config.thresholds);
  const st = scoreStructure(s);
  const pillars = {
    quality: q.score,
    alive: a.score,
    structure: st.score
  };
  const score = clamp(
    config.weights.quality * pillars.quality + config.weights.alive * pillars.alive + config.weights.structure * pillars.structure
  );
  const drivers = [
    .../* @__PURE__ */ new Set([...a.drivers, ...q.drivers, ...st.drivers])
  ].slice(0, 10);
  const blockers = [
    .../* @__PURE__ */ new Set([...a.blockers, ...q.blockers, ...st.blockers])
  ].slice(0, 10);
  return {
    signals: s,
    score,
    pillars,
    status: deriveStatus(s, config.thresholds),
    drivers,
    blockers
  };
}
function scoreAll(signals, config) {
  return signals.map((s) => scoreRepo(s, config)).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.signals.fullName.localeCompare(b.signals.fullName);
  });
}

// src/run.ts
async function runRuro(options) {
  const cwd = resolve2(options.cwd ?? process.cwd());
  const clients = createClients(options.token);
  const { included, excludedCount } = await collectRepoSignals(
    clients,
    options.config
  );
  const probes = await probeAll(
    included.map((r) => r.homepageUrl),
    options.config
  );
  included.forEach((repo, i) => {
    repo.demo = probes[i];
  });
  const scored = scoreAll(included, options.config);
  const report = buildReport(options.config, scored, excludedCount);
  const dashboardMarkdown = renderDashboard(report, options.config);
  const dashboardPath = resolve2(cwd, options.config.render.dashboard_path);
  const dataPath = resolve2(cwd, options.config.render.data_path);
  if (!options.dryRun) {
    mkdirSync(dirname(dashboardPath), { recursive: true });
    mkdirSync(dirname(dataPath), { recursive: true });
    writeFileSync(dashboardPath, dashboardMarkdown, "utf8");
    writeFileSync(dataPath, `${JSON.stringify(report, null, 2)}
`, "utf8");
    if (options.config.render.history) {
      const day = report.generated_at.slice(0, 10);
      const historyPath = resolve2(
        cwd,
        join(options.config.render.history_dir, `${day}.json`)
      );
      mkdirSync(dirname(historyPath), { recursive: true });
      writeFileSync(historyPath, `${JSON.stringify(report, null, 2)}
`, "utf8");
    }
  }
  return { report, dashboardMarkdown, dashboardPath, dataPath };
}

// src/index.ts
async function main() {
  const token = core.getInput("token", { required: true });
  const configPath = core.getInput("config-path") || "ruro.yml";
  const ownerInput = core.getInput("owner") || void 0;
  const dryRun = core.getBooleanInput("dry-run");
  const owner = ownerInput || void 0;
  let config = loadConfig(configPath, owner);
  if (!config.owner) {
    config = {
      ...config,
      owner: github.context.repo.owner
    };
  }
  core.info(`Ruro scanning owner=${config.owner} dryRun=${dryRun}`);
  const result = await runRuro({ token, config, dryRun });
  core.setOutput("repo-count", String(result.report.included_count));
  core.setOutput("dashboard-path", result.dashboardPath);
  core.info(
    `Scored ${result.report.included_count} repos \u2192 ${result.dashboardPath}`
  );
}
main().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
