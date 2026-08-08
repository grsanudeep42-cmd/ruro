#!/usr/bin/env node

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
    title: z.string().default("Ruro Portfolio Scorecard"),
    profile_snippet_path: z.string().default("PROFILE_SNIPPET.md"),
    profile_svg_path: z.string().default("assets/ruro-card.svg"),
    profile_top_n: z.number().int().positive().default(5),
    web_path: z.string().default("docs/index.html")
  }),
  privacy: z.object({
    mode: z.enum(["full", "public_only_render"]).default("full")
  }).default({ mode: "full" }),
  profile: z.object({
    enabled: z.boolean().default(false),
    repo: z.string().default(""),
    readme_path: z.string().default("README.md"),
    commit_message: z.string().default("chore(ruro): refresh profile portfolio truth")
  }).default({
    enabled: false,
    repo: "",
    readme_path: "README.md",
    commit_message: "chore(ruro): refresh profile portfolio truth"
  }),
  ai: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(["copilot", "none"]).default("none"),
    top_n: z.number().int().positive().default(5),
    cache_dir: z.string().default("data/ai")
  }).default({
    enabled: false,
    provider: "none",
    top_n: 5,
    cache_dir: "data/ai"
  })
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
function defaultConfig(owner) {
  return ConfigSchema.parse({
    schema_version: 1,
    owner,
    scan: {
      include_private: true,
      include_forks: false,
      include_archived: true,
      exclude_repos: ["ruro", ".github"]
    },
    weights: { quality: 0.4, alive: 0.35, structure: 0.25 },
    thresholds: { active_days: 90, stale_days: 180, dormant_days: 365 },
    probes: {
      enabled: true,
      timeout_ms: 8e3,
      user_agent: "ruro-probe/0.1",
      follow_redirects: true
    },
    render: {
      dashboard_path: "DASHBOARD.md",
      data_path: "data/latest.json",
      history: true,
      history_dir: "data/history",
      title: "Ruro Portfolio Scorecard",
      profile_snippet_path: "PROFILE_SNIPPET.md",
      profile_svg_path: "assets/ruro-card.svg",
      profile_top_n: 5,
      web_path: "docs/index.html"
    },
    privacy: { mode: "full" },
    profile: {
      enabled: false,
      repo: `${owner}/${owner}`,
      readme_path: "README.md",
      commit_message: "chore(ruro): refresh profile portfolio truth"
    },
    ai: {
      enabled: false,
      provider: "none",
      top_n: 5,
      cache_dir: "data/ai"
    }
  });
}

// src/cli/view.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { resolve as resolve2 } from "node:path";
function loadLatestReport(config, cwd = process.cwd()) {
  const path = resolve2(cwd, config.render.data_path);
  if (!existsSync2(path)) {
    throw new Error(
      `No scorecard data at ${path}. Run \`ruro scan\` first.`
    );
  }
  const parsed = JSON.parse(readFileSync2(path, "utf8"));
  if (parsed?.schema_version !== 1 || !Array.isArray(parsed.repos)) {
    throw new Error(`Invalid scorecard data at ${path}`);
  }
  return parsed;
}
function pad(text, width) {
  if (text.length >= width) return text.slice(0, width - 1) + "\u2026";
  return text + " ".repeat(width - text.length);
}
function formatRow(repo, rank) {
  const name = pad(repo.signals.name, 22);
  const status = pad(repo.status, 9);
  const score = String(repo.score).padStart(3, " ");
  const lang = pad(repo.signals.primaryLanguage ?? "\u2014", 12);
  const demo = pad(repo.signals.demo.status, 6);
  return `${String(rank).padStart(2, " ")}  ${name}  ${status}  ${score}  ${lang}  ${demo}`;
}
function printView(report) {
  const mix = Object.entries(report.status_counts).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join("  ");
  console.log(`Ruro \xB7 ${report.owner} \xB7 ${report.generated_at}`);
  console.log(
    `included ${report.included_count}/${report.repo_count}  excluded ${report.excluded_count}`
  );
  console.log(mix || "no statuses");
  console.log("");
  console.log(" #  repo                    status     sc   stack         demo");
  console.log("--  ----------------------  ---------  ---  ------------  ------");
  report.repos.forEach((repo, i) => {
    console.log(formatRow(repo, i + 1));
  });
}
function printTop(report, n) {
  const top = report.repos.slice(0, Math.max(1, n));
  console.log(`Top ${top.length} \xB7 ${report.owner}`);
  top.forEach((repo, i) => {
    console.log(
      `${i + 1}. ${repo.signals.fullName}  [${repo.status}]  score ${repo.score}`
    );
    console.log(
      `   drivers: ${repo.drivers.join(", ") || "\u2014"}`
    );
  });
}
function printStatus(report, query) {
  const q = query.toLowerCase();
  const repo = report.repos.find(
    (r) => r.signals.name.toLowerCase() === q || r.signals.fullName.toLowerCase() === q || r.signals.fullName.toLowerCase().endsWith(`/${q}`)
  );
  if (!repo) {
    throw new Error(`Repo not found in latest scorecard: ${query}`);
  }
  console.log(repo.signals.fullName);
  console.log(`url        ${repo.signals.url}`);
  console.log(`status     ${repo.status}`);
  console.log(`score      ${repo.score}`);
  console.log(
    `pillars    quality=${repo.pillars.quality} alive=${repo.pillars.alive} structure=${repo.pillars.structure}`
  );
  console.log(`demo       ${repo.signals.demo.status}${repo.signals.demo.url ? ` (${repo.signals.demo.url})` : ""}`);
  console.log(`language   ${repo.signals.primaryLanguage ?? "\u2014"}`);
  console.log(`drivers    ${repo.drivers.join(", ") || "\u2014"}`);
  console.log(`blockers   ${repo.blockers.join(", ") || "\u2014"}`);
}

// src/run.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync2, readFileSync as readFileSync4, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname, join as join2, resolve as resolve4 } from "node:path";

// src/ai/copilot.ts
import { existsSync as existsSync3, mkdirSync, readFileSync as readFileSync3, writeFileSync } from "node:fs";
import { join, resolve as resolve3 } from "node:path";
async function annotateWithCopilot(opts) {
  const { report, config, cwd } = opts;
  if (!config.ai.enabled || config.ai.provider !== "copilot") {
    return { annotated: 0, skipped: true, reason: "ai disabled" };
  }
  const cacheDir = resolve3(cwd, config.ai.cache_dir);
  mkdirSync(cacheDir, { recursive: true });
  const hasCli = await commandExists("copilot");
  if (!hasCli) {
    const stub = {
      generated_at: (/* @__PURE__ */ new Date()).toISOString(),
      provider: "copilot",
      status: "unavailable",
      note: "Copilot CLI not found on PATH. Scores unchanged; enable CLI/credits to annotate.",
      repos: []
    };
    writeFileSync(
      join(cacheDir, "latest.json"),
      `${JSON.stringify(stub, null, 2)}
`,
      "utf8"
    );
    return { annotated: 0, skipped: true, reason: "copilot cli missing" };
  }
  const top = report.repos.slice(0, config.ai.top_n);
  const narratives = top.map((repo) => {
    const narrative = [
      `${repo.signals.name} is ${repo.status} at score ${repo.score}.`,
      repo.drivers.length ? `Drivers: ${repo.drivers.join(", ")}.` : null,
      repo.blockers.length ? `Blockers: ${repo.blockers.join(", ")}.` : null,
      repo.signals.demo.status === "UP" ? "Demo responds." : "No live demo confirmed."
    ].filter(Boolean).join(" ");
    return { fullName: repo.signals.fullName, narrative };
  });
  const payload = {
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: "copilot",
    status: "signal_fallback",
    note: "Live Copilot prompting is gated. Cached signal-derived annotations written for top repos.",
    repos: narratives
  };
  writeFileSync(
    join(cacheDir, "latest.json"),
    `${JSON.stringify(payload, null, 2)}
`,
    "utf8"
  );
  for (const item of narratives) {
    const safe = item.fullName.replace(/[^\w.-]+/g, "_");
    writeFileSync(join(cacheDir, `${safe}.md`), `${item.narrative}
`, "utf8");
  }
  return { annotated: narratives.length, skipped: false };
}
async function commandExists(bin) {
  try {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(bin, ["--help"], {
      stdio: "ignore",
      timeout: 2e3
    });
    return result.status === 0 || result.status === 1;
  } catch {
    return false;
  }
}

// src/github/collect.ts
import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";

// src/github/retry.ts
async function withRetries(label, fn, opts = {}) {
  const attempts = opts.attempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const retryable = /502|503|504|ECONNRESET|ETIMEDOUT|rate limit|secondary rate|ABORTED|fetch failed/i.test(
        message
      ) || typeof err === "object" && err !== null && "status" in err && [502, 503, 504, 429].includes(Number(err.status));
      if (!retryable || attempt === attempts) break;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} failed after ${attempts} attempts: ${detail}`);
}

// src/github/collect.ts
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
    gql: (query, variables) => withRetries(`graphql`, () => gqlClient(query, variables))
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
        srcDir: object(expression: "HEAD:src") { ... on Tree { id } }
        dockerfile: object(expression: "HEAD:Dockerfile") { ... on Blob { id } }
        containerfile: object(expression: "HEAD:Containerfile") { ... on Blob { id } }
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
    hasSrcLayout: Boolean(node.srcDir),
    hasContainerfile: Boolean(node.dockerfile || node.containerfile),
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
      const { data } = await withRetries(
        `actions:${repo.fullName}`,
        () => clients.octokit.actions.listWorkflowRunsForRepo({
          owner,
          repo: name,
          per_page: 1,
          branch: repo.defaultBranch ?? void 0
        }),
        { attempts: 3, baseDelayMs: 250 }
      );
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

// src/history/transitions.ts
function computeTransitions(previous, current) {
  if (!previous) return [];
  const prevMap = new Map(
    previous.repos.map((r) => [
      r.signals.fullName,
      { status: r.status, score: r.score }
    ])
  );
  const out = [];
  for (const repo of current.repos) {
    const prior = prevMap.get(repo.signals.fullName);
    if (!prior) continue;
    if (prior.status === repo.status) continue;
    out.push({
      fullName: repo.signals.fullName,
      name: repo.signals.name,
      url: repo.signals.url,
      from: prior.status,
      to: repo.status,
      scoreFrom: prior.score,
      scoreTo: repo.score
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
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

// src/profile/sync.ts
import { Octokit as Octokit2 } from "@octokit/rest";

// src/profile/inject.ts
var START = "<!-- RURO:START -->";
var END = "<!-- RURO:END -->";
function injectRuroBlock(readme, block) {
  const normalizedBlock = block.trim().endsWith(END) ? block.trim() : `${START}
${block.trim()}
${END}`;
  const startIdx = readme.indexOf(START);
  const endIdx = readme.indexOf(END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = readme.slice(0, startIdx);
    const after = readme.slice(endIdx + END.length);
    return `${before}${normalizedBlock}${after}`;
  }
  const projectsMatch = readme.match(
    /##\s*[░]?\s*PROJECTS[\s\S]*?(?=\n##\s*[░]|\n---\s*\n|$)/i
  );
  if (projectsMatch && projectsMatch.index !== void 0) {
    const before = readme.slice(0, projectsMatch.index);
    const after = readme.slice(projectsMatch.index + projectsMatch[0].length);
    return `${before}${normalizedBlock}

${after}`.replace(/\n{3,}/g, "\n\n");
  }
  return `${readme.trimEnd()}

${normalizedBlock}
`;
}

// src/profile/sync.ts
async function syncProfileReadme(token, config, snippetMarkdown) {
  const profile = config.profile;
  if (!profile.enabled) {
    return { updated: false, repo: "", path: "" };
  }
  const [owner, repo] = profile.repo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid profile.repo: ${profile.repo}`);
  }
  const octokit = new Octokit2({ auth: token, userAgent: "ruro/0.1" });
  const path = profile.readme_path;
  const existing = await withRetries(
    `profile:get:${profile.repo}`,
    () => octokit.repos.getContent({ owner, repo, path })
  );
  if (Array.isArray(existing.data) || existing.data.type !== "file") {
    throw new Error(`${profile.repo}/${path} is not a file`);
  }
  const file = existing.data;
  const current = Buffer.from(file.content ?? "", "base64").toString("utf8");
  const next = injectRuroBlock(current, snippetMarkdown);
  if (next === current) {
    return {
      updated: false,
      repo: profile.repo,
      path,
      sha: file.sha
    };
  }
  const written = await withRetries(
    `profile:put:${profile.repo}`,
    () => octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: profile.commit_message,
      content: Buffer.from(next, "utf8").toString("base64"),
      sha: file.sha,
      committer: {
        name: "Anudeep GRS",
        email: "grsanudeep42@gmail.com"
      },
      author: {
        name: "Anudeep GRS",
        email: "grsanudeep42@gmail.com"
      }
    })
  );
  return {
    updated: true,
    repo: profile.repo,
    path,
    sha: written.data.content?.sha
  };
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
function buildReport(config, repos, excludedCount, transitions = []) {
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
    repos: visible,
    transitions
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
  lines.push("## Status changes", "");
  if (!report.transitions.length) {
    lines.push("_No status changes since the previous run._", "");
  } else {
    for (const t of report.transitions) {
      lines.push(
        `- **[${t.name}](${t.url})**: \`${t.from}\` \u2192 \`${t.to}\` (score ${t.scoreFrom} \u2192 ${t.scoreTo})`
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

// src/render/profile.ts
function escXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function statusTone(status) {
  switch (status) {
    case "LIVE":
      return "#b6ff3b";
    case "ACTIVE":
      return "#7dd3fc";
    case "STALE":
      return "#fbbf24";
    case "DORMANT":
      return "#fb923c";
    case "DEAD":
      return "#f87171";
    case "ARCHIVED":
      return "#94a3b8";
    default:
      return "#e2e8f0";
  }
}
function barWidth(score, max = 120) {
  return Math.max(4, Math.round(Math.min(100, Math.max(0, score)) / 100 * max));
}
function renderProfileSvg(report, config) {
  const top = report.repos.slice(0, config.render.profile_top_n);
  const generated = report.generated_at.slice(0, 10);
  const rows = top.map((repo, i) => {
    const y = 118 + i * 44;
    const tone = statusTone(repo.status);
    const w = barWidth(repo.score);
    return `
  <text x="28" y="${y}" fill="#94a3b8" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${i + 1}</text>
  <text x="48" y="${y}" fill="#f8fafc" font-size="14" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escXml(repo.signals.name)}</text>
  <text x="48" y="${y + 16}" fill="#64748b" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escXml(repo.signals.primaryLanguage ?? "\u2014")} \xB7 ${escXml(repo.status)}</text>
  <rect x="430" y="${y - 10}" width="120" height="8" rx="4" fill="#1e293b"/>
  <rect x="430" y="${y - 10}" width="${w}" height="8" rx="4" fill="${tone}"/>
  <text x="560" y="${y}" fill="${tone}" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="end">${repo.score}</text>`;
  }).join("\n");
  const height = 130 + top.length * 44 + 36;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${height}" viewBox="0 0 600 ${height}" role="img" aria-label="Ruro portfolio scorecard">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07090d"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="600" height="${height}" rx="18" fill="url(#bg)"/>
  <rect x="1" y="1" width="598" height="${height - 2}" rx="17" fill="none" stroke="#1f2937"/>
  <text x="28" y="42" fill="#b6ff3b" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" letter-spacing="2">RURO</text>
  <text x="28" y="68" fill="#f8fafc" font-size="22" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">portfolio truth</text>
  <text x="572" y="42" fill="#64748b" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="end">${escXml(generated)}</text>
  <text x="28" y="92" fill="#94a3b8" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${report.included_count} scored \xB7 LIVE ${report.status_counts.LIVE} \xB7 ACTIVE ${report.status_counts.ACTIVE} \xB7 STALE ${report.status_counts.STALE}</text>
  <line x1="28" y1="104" x2="572" y2="104" stroke="#1f2937"/>
${rows}
  <text x="28" y="${height - 16}" fill="#475569" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">deterministic \xB7 zero AI \xB7 github-native</text>
</svg>
`;
}
function renderProfileSnippet(report, config) {
  const top = report.repos.slice(0, config.render.profile_top_n);
  const svgPath = config.render.profile_svg_path;
  const cardUrl = `https://raw.githubusercontent.com/${config.owner}/ruro/main/${svgPath}`;
  const rows = top.map((r) => {
    const demo = r.signals.demo.status === "UP" ? "live demo" : r.signals.demo.status === "NONE" ? "no demo" : "demo down";
    return `| **[${r.signals.name}](${r.signals.url})** | \`${r.status}\` | **${r.score}** | ${r.signals.primaryLanguage ?? "\u2014"} | ${demo} |`;
  }).join("\n");
  return `<!-- RURO:START -->
## \u2591 PORTFOLIO TRUTH

<div align="center">

<img src="${cardUrl}" width="600" alt="Ruro portfolio scorecard" />

</div>

| Project | Status | Score | Stack | Demo |
|---|---|---:|---|---|
${rows}

<sub>Auto-maintained by [Ruro](https://github.com/${config.owner}/ruro) \xB7 ${report.generated_at.slice(0, 10)} \xB7 zero AI</sub>
<!-- RURO:END -->
`;
}

// src/render/web.ts
function esc2(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function statusClass(status) {
  return `st-${status.toLowerCase()}`;
}
function row(repo, rank) {
  const lang = repo.signals.primaryLanguage ?? "\u2014";
  const demo = repo.signals.demo.status;
  const notes = [...repo.drivers.slice(0, 2), ...repo.blockers.slice(0, 1)].join(", ");
  return `<tr>
  <td class="rank">${rank}</td>
  <td class="name"><a href="${esc2(repo.signals.url)}" target="_blank" rel="noreferrer">${esc2(repo.signals.name)}</a></td>
  <td><span class="pill ${statusClass(repo.status)}">${esc2(repo.status)}</span></td>
  <td class="score"><strong>${repo.score}</strong></td>
  <td>${repo.pillars.quality}</td>
  <td>${repo.pillars.alive}</td>
  <td>${repo.pillars.structure}</td>
  <td><span class="pill demo-${demo.toLowerCase()}">${esc2(demo)}</span></td>
  <td>${esc2(lang)}</td>
  <td class="notes">${esc2(notes || "\u2014")}</td>
</tr>`;
}
function renderWebDashboard(report, config) {
  const top = report.repos.slice(0, 3);
  const topHtml = top.map(
    (r, i) => `<article class="top-card">
  <div class="top-rank">0${i + 1}</div>
  <h2><a href="${esc2(r.signals.url)}" target="_blank" rel="noreferrer">${esc2(r.signals.name)}</a></h2>
  <p><span class="pill ${statusClass(r.status)}">${esc2(r.status)}</span> <span class="score-lg">${r.score}</span></p>
  <p class="muted">${esc2(r.drivers.slice(0, 3).join(" \xB7 ") || "\u2014")}</p>
</article>`
  ).join("\n");
  const rows = report.repos.map((r, i) => row(r, i + 1)).join("\n");
  const mix = Object.entries(report.status_counts).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(" \xB7 ");
  const transitions = report.transitions.length === 0 ? `<p class="muted">No status changes since the previous run.</p>` : `<ul class="transitions">${report.transitions.map(
    (t) => `<li><a href="${esc2(t.url)}">${esc2(t.name)}</a>: <code>${esc2(t.from)}</code> \u2192 <code>${esc2(t.to)}</code> (${t.scoreFrom} \u2192 ${t.scoreTo})</li>`
  ).join("")}</ul>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc2(config.render.title)}</title>
  <style>
    :root {
      --bg: #07090d;
      --panel: #0f141c;
      --line: #1f2937;
      --text: #f8fafc;
      --muted: #94a3b8;
      --lime: #b6ff3b;
      --sky: #7dd3fc;
      --amber: #fbbf24;
      --orange: #fb923c;
      --red: #f87171;
      --slate: #94a3b8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background:
        radial-gradient(1200px 500px at 10% -10%, #122018 0%, transparent 55%),
        var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 40px 20px 80px; }
    .eyebrow { color: var(--lime); letter-spacing: 0.18em; font-size: 12px; margin: 0 0 10px; }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 4vw, 40px); font-weight: 600; }
    .sub { color: var(--muted); margin: 0 0 28px; line-height: 1.5; }
    .stats {
      display: flex; flex-wrap: wrap; gap: 10px 18px;
      padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px;
      background: rgba(15,20,28,0.85); margin-bottom: 28px;
    }
    .stats span { color: var(--muted); font-size: 12px; }
    .stats strong { color: var(--text); }
    .tops { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
    @media (max-width: 860px) { .tops { grid-template-columns: 1fr; } }
    .top-card {
      background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
      padding: 18px; min-height: 140px;
    }
    .top-rank { color: var(--lime); font-size: 12px; letter-spacing: 0.12em; margin-bottom: 8px; }
    .top-card h2 { margin: 0 0 10px; font-size: 18px; }
    .top-card a { color: var(--text); text-decoration: none; }
    .top-card a:hover { color: var(--lime); }
    .score-lg { color: var(--lime); font-size: 20px; margin-left: 8px; }
    .muted { color: var(--muted); font-size: 12px; }
    h3 { margin: 0 0 12px; font-size: 14px; letter-spacing: 0.08em; color: var(--muted); text-transform: uppercase; }
    .panel {
      background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
      padding: 18px; margin-bottom: 22px; overflow: auto;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #17202b; vertical-align: top; }
    th { color: var(--muted); font-weight: 500; white-space: nowrap; }
    td.rank, td.score { font-variant-numeric: tabular-nums; }
    td.name a { color: var(--text); text-decoration: none; }
    td.name a:hover { color: var(--lime); }
    td.notes { color: var(--muted); max-width: 220px; }
    .pill {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      border: 1px solid var(--line); font-size: 11px;
    }
    .st-live { color: #052e16; background: var(--lime); border-color: transparent; }
    .st-active { color: #0c4a6e; background: var(--sky); border-color: transparent; }
    .st-stale { color: #78350f; background: var(--amber); border-color: transparent; }
    .st-dormant { color: #7c2d12; background: var(--orange); border-color: transparent; }
    .st-dead { color: #7f1d1d; background: var(--red); border-color: transparent; }
    .st-archived { color: #0f172a; background: var(--slate); border-color: transparent; }
    .demo-up { color: var(--lime); }
    .demo-down, .demo-error { color: var(--red); }
    .demo-none { color: var(--muted); }
    .transitions { margin: 0; padding-left: 18px; color: var(--muted); }
    .transitions a { color: var(--text); }
    footer { margin-top: 18px; color: #475569; font-size: 11px; }
  </style>
</head>
<body>
  <main class="wrap">
    <p class="eyebrow">RURO</p>
    <h1>${esc2(config.render.title)}</h1>
    <p class="sub">Deterministic portfolio truth for <code>${esc2(report.owner)}</code>. Zero AI core. Generated ${esc2(report.generated_at)}.</p>
    <div class="stats">
      <span>scanned <strong>${report.repo_count}</strong></span>
      <span>included <strong>${report.included_count}</strong></span>
      <span>excluded <strong>${report.excluded_count}</strong></span>
      <span>${esc2(mix || "\u2014")}</span>
    </div>
    <section class="tops">${topHtml || "<p class='muted'>No repositories scored.</p>"}</section>
    <section class="panel">
      <h3>Status changes</h3>
      ${transitions}
    </section>
    <section class="panel">
      <h3>All projects</h3>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Repo</th><th>Status</th><th>Score</th>
            <th>Quality</th><th>Alive</th><th>Structure</th>
            <th>Demo</th><th>Stack</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
    <footer>Same inputs \u21D2 same scores. Host via GitHub Pages from /docs.</footer>
  </main>
</body>
</html>
`;
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
  if (s.hasSrcLayout) {
    score += 4;
    drivers.push("src_layout");
  }
  if (s.hasContainerfile) {
    score += 4;
    drivers.push("containerized");
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
function loadPreviousReport(dataPath) {
  if (!existsSync4(dataPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync4(dataPath, "utf8"));
    if (parsed?.schema_version !== 1 || !Array.isArray(parsed.repos)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
async function runRuro(options) {
  const cwd = resolve4(options.cwd ?? process.cwd());
  const dataPath = resolve4(cwd, options.config.render.data_path);
  const previous = loadPreviousReport(dataPath);
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
  const draft = buildReport(options.config, scored, excludedCount, []);
  const transitions = computeTransitions(previous, draft);
  const report = { ...draft, transitions };
  const dashboardMarkdown = renderDashboard(report, options.config);
  const profileSnippet = renderProfileSnippet(report, options.config);
  const profileSvg = renderProfileSvg(report, options.config);
  const webHtml = renderWebDashboard(report, options.config);
  const dashboardPath = resolve4(cwd, options.config.render.dashboard_path);
  const profileSnippetPath = resolve4(
    cwd,
    options.config.render.profile_snippet_path
  );
  const profileSvgPath = resolve4(cwd, options.config.render.profile_svg_path);
  const webPath = resolve4(cwd, options.config.render.web_path);
  let profileSynced = false;
  let aiAnnotated = 0;
  if (!options.dryRun) {
    mkdirSync2(dirname(dashboardPath), { recursive: true });
    mkdirSync2(dirname(dataPath), { recursive: true });
    mkdirSync2(dirname(profileSnippetPath), { recursive: true });
    mkdirSync2(dirname(profileSvgPath), { recursive: true });
    mkdirSync2(dirname(webPath), { recursive: true });
    writeFileSync2(dashboardPath, dashboardMarkdown, "utf8");
    writeFileSync2(dataPath, `${JSON.stringify(report, null, 2)}
`, "utf8");
    writeFileSync2(profileSnippetPath, profileSnippet, "utf8");
    writeFileSync2(profileSvgPath, profileSvg, "utf8");
    writeFileSync2(webPath, webHtml, "utf8");
    if (options.config.render.history) {
      const day = report.generated_at.slice(0, 10);
      const historyPath = resolve4(
        cwd,
        join2(options.config.render.history_dir, `${day}.json`)
      );
      mkdirSync2(dirname(historyPath), { recursive: true });
      writeFileSync2(historyPath, `${JSON.stringify(report, null, 2)}
`, "utf8");
    }
    const shouldSync = options.syncProfile ?? options.config.profile.enabled;
    if (shouldSync && options.config.profile.enabled) {
      const sync = await syncProfileReadme(
        options.token,
        options.config,
        profileSnippet
      );
      profileSynced = sync.updated;
    }
    if (options.config.ai.enabled && options.config.ai.provider === "copilot") {
      const ai = await annotateWithCopilot({
        report,
        config: options.config,
        cwd
      });
      aiAnnotated = ai.annotated;
    }
  }
  return {
    report,
    dashboardMarkdown,
    dashboardPath,
    dataPath,
    profileSnippetPath,
    profileSvgPath,
    webPath,
    profileSynced,
    aiAnnotated
  };
}

// src/cli.ts
function usage() {
  console.log(`Ruro \u2014 portfolio Jarvis for GitHub (core: zero AI)

Usage:
  ruro [scan] [--config ruro.yml] [--owner LOGIN] [--token TOKEN] [--dry-run] [--sync-profile]
  ruro view [--config ruro.yml]
  ruro top [n] [--config ruro.yml]
  ruro status <repo> [--config ruro.yml]

Env:
  GITHUB_TOKEN / GH_TOKEN   required for scan unless --token is set
`);
  process.exit(1);
}
function parseConfigPath(args) {
  let configPath = "ruro.yml";
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--config") {
      configPath = args[++i];
    } else {
      rest.push(args[i]);
    }
  }
  return { configPath, rest };
}
function loadCfg(configPath, owner) {
  try {
    return loadConfig(configPath, owner);
  } catch {
    if (!owner) {
      console.error(`Config missing at ${configPath}; pass --owner.`);
      process.exit(1);
    }
    return defaultConfig(owner);
  }
}
async function runScan(args) {
  let configPath = "ruro.yml";
  let owner;
  let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || void 0;
  let dryRun = false;
  let syncProfile;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--config") configPath = args[++i];
    else if (a === "--owner") owner = args[++i];
    else if (a === "--token") token = args[++i];
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--sync-profile") syncProfile = true;
    else if (a === "--no-sync-profile") syncProfile = false;
    else {
      console.error(`Unknown arg: ${a}`);
      usage();
    }
  }
  if (!token) {
    console.error("Missing token. Set GITHUB_TOKEN or pass --token.");
    process.exit(1);
  }
  const config = loadCfg(configPath, owner);
  const result = await runRuro({ token, config, dryRun, syncProfile });
  console.log(
    `Ruro: ${result.report.included_count} repos scored. Dashboard \u2192 ${result.dashboardPath}`
  );
  console.log(`Web \u2192 ${result.webPath}`);
  if (result.report.repos[0]) {
    const top = result.report.repos[0];
    console.log(
      `Top: ${top.signals.fullName} (${top.status}, score ${top.score})`
    );
  }
  if (result.profileSynced) {
    console.log(
      `Profile synced \u2192 ${config.profile.repo}/${config.profile.readme_path}`
    );
  }
  if (result.aiAnnotated > 0) {
    console.log(`AI annotations \u2192 ${result.aiAnnotated} repos`);
  }
}
async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) usage();
  const cmd = argv[0];
  const isSub = cmd === "scan" || cmd === "view" || cmd === "top" || cmd === "status";
  if (!isSub) {
    await runScan(argv);
    return;
  }
  const subArgs = argv.slice(1);
  if (cmd === "scan") {
    await runScan(subArgs);
    return;
  }
  const { configPath, rest } = parseConfigPath(subArgs);
  const config = loadCfg(configPath);
  const report = loadLatestReport(config);
  if (cmd === "view") {
    printView(report);
    return;
  }
  if (cmd === "top") {
    const n = rest[0] ? Number.parseInt(rest[0], 10) : 5;
    if (!Number.isFinite(n) || n < 1) {
      console.error("top expects a positive integer");
      process.exit(1);
    }
    printTop(report, n);
    return;
  }
  if (cmd === "status") {
    const query = rest[0];
    if (!query) {
      console.error("status expects a repo name");
      process.exit(1);
    }
    printStatus(report, query);
  }
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
