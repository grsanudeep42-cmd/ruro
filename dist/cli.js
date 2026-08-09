#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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
var init_retry = __esm({
  "src/github/retry.ts"() {
    "use strict";
  }
});

// src/fitness/code.ts
var code_exports = {};
__export(code_exports, {
  analyzeTreeEntries: () => analyzeTreeEntries,
  applyTreeSignals: () => applyTreeSignals,
  classifyTreePaths: () => classifyTreePaths,
  enrichCodeFitness: () => enrichCodeFitness
});
function emptyFitness() {
  return {
    sourceFiles: 0,
    testFiles: 0,
    otherFiles: 0,
    maxBlobBytes: 0,
    score: 0,
    flags: ["tree_unavailable"]
  };
}
function classifyTreePaths(entries) {
  const paths = entries.filter((e) => e.type === "blob" && e.path && !SKIP.test(e.path)).map((e) => e.path);
  const hasPackageManifest = paths.some((p) => MANIFEST.test(p));
  const hasLockfile = paths.some((p) => LOCKFILE.test(p));
  const hasLintConfigHeuristic = paths.some((p) => LINT.test(p));
  const hasWorkflows = paths.some((p) => WORKFLOW.test(p));
  const hasDependabotConfig = paths.some((p) => DEPENDABOT.test(p));
  const hasCodeowners = paths.some((p) => CODEOWNERS.test(p));
  const hasContainerfile = paths.some((p) => DOCKER.test(p));
  const hasSrcLayout = paths.some((p) => SRC_LAYOUT.test(p));
  const hasLicenseFile = paths.some((p) => LICENSE.test(p));
  const testFiles = paths.filter((p) => TEST_HINT.test(p)).length;
  const hasTestTool = paths.some((p) => TEST_TOOL.test(p));
  const hasTestsHeuristic = testFiles > 0 || hasTestTool;
  const hasTestScript = hasTestTool || testFiles > 0;
  return {
    hasPackageManifest,
    hasLockfile,
    hasLintConfigHeuristic,
    hasWorkflows,
    hasDependabotConfig,
    hasCodeowners,
    hasContainerfile,
    hasSrcLayout,
    hasLicenseFile,
    hasTestsHeuristic,
    hasTestScript
  };
}
function applyTreeSignals(repo, patch) {
  repo.hasPackageManifest = patch.hasPackageManifest;
  repo.hasLockfile = patch.hasLockfile;
  repo.hasLintConfigHeuristic = patch.hasLintConfigHeuristic;
  repo.hasWorkflows = patch.hasWorkflows;
  repo.hasDependabotConfig = patch.hasDependabotConfig;
  repo.hasCodeowners = patch.hasCodeowners;
  repo.hasContainerfile = patch.hasContainerfile;
  repo.hasSrcLayout = patch.hasSrcLayout;
  if (patch.hasLicenseFile) repo.hasLicenseFile = true;
  repo.hasTestsHeuristic = patch.hasTestsHeuristic;
  repo.hasTestScript = patch.hasTestScript;
}
function analyzeTreeEntries(entries) {
  let sourceFiles = 0;
  let testFiles = 0;
  let otherFiles = 0;
  let maxBlobBytes = 0;
  const flags = [];
  for (const e of entries) {
    if (e.type !== "blob" || !e.path) continue;
    if (SKIP.test(e.path)) continue;
    const size = e.size ?? 0;
    if (!BINARYish.test(e.path) && size > maxBlobBytes) maxBlobBytes = size;
    if (SOURCE_EXT.test(e.path)) {
      if (TEST_HINT.test(e.path)) testFiles += 1;
      else sourceFiles += 1;
    } else {
      otherFiles += 1;
    }
  }
  let score = 10;
  if (sourceFiles >= 3) {
    score += 25;
    flags.push("has_source");
  } else if (sourceFiles === 0) {
    flags.push("no_source_files");
    score -= 20;
  } else {
    flags.push("thin_source");
  }
  if (testFiles >= 1) {
    score += 25;
    flags.push("has_test_files");
  } else {
    flags.push("no_test_files");
  }
  if (sourceFiles >= 10) {
    score += 15;
    flags.push("nontrivial_tree");
  }
  if (sourceFiles > 0 && testFiles / Math.max(sourceFiles, 1) >= 0.15) {
    score += 15;
    flags.push("healthy_test_ratio");
  } else if (sourceFiles >= 5 && testFiles === 0) {
    score -= 10;
  }
  if (maxBlobBytes > 25e4) {
    score -= 12;
    flags.push("god_file");
  }
  if (sourceFiles + testFiles + otherFiles < 5) {
    score -= 15;
    flags.push("tiny_tree");
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    sourceFiles,
    testFiles,
    otherFiles,
    maxBlobBytes,
    score,
    flags: flags.slice(0, 8)
  };
}
async function enrichCodeFitness(clients, repos) {
  for (const repo of repos) {
    repo.fitness = emptyFitness();
    const [owner, name] = repo.fullName.split("/");
    const branch = repo.defaultBranch;
    if (!owner || !name || !branch) continue;
    try {
      const ref = await withRetries(
        `ref:${repo.fullName}`,
        () => clients.octokit.git.getRef({
          owner,
          repo: name,
          ref: `heads/${branch}`
        }),
        { attempts: 2, baseDelayMs: 200 }
      );
      const sha = ref.data.object.sha;
      const tree = await withRetries(
        `tree:${repo.fullName}`,
        () => clients.octokit.git.getTree({
          owner,
          repo: name,
          tree_sha: sha,
          recursive: "true"
        }),
        { attempts: 2, baseDelayMs: 200 }
      );
      const entries = tree.data.tree;
      repo.fitness = analyzeTreeEntries(entries);
      applyTreeSignals(repo, classifyTreePaths(entries));
    } catch {
    }
  }
}
var SOURCE_EXT, TEST_HINT, SKIP, BINARYish, MANIFEST, LOCKFILE, LINT, TEST_TOOL, WORKFLOW, DEPENDABOT, CODEOWNERS, DOCKER, SRC_LAYOUT, LICENSE;
var init_code = __esm({
  "src/fitness/code.ts"() {
    "use strict";
    init_retry();
    SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|swift|c|cc|cpp|h|hpp|cs|rb|php|vue|svelte|scala|dart)$/i;
    TEST_HINT = /(^|\/)(tests?|__tests__|spec)(\/|$)|[._-](test|spec)\.[^.]+$/i;
    SKIP = /(^|\/)(node_modules|dist|build|\.git|vendor|coverage|\.next|target)(\/|$)/i;
    BINARYish = /\.(png|jpe?g|gif|webp|ico|mp4|mov|wav|mp3|pdf|zip|gz|tgz|wasm|woff2?|ttf|eot|psd|ai)$/i;
    MANIFEST = /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|requirements\.txt|composer\.json|Gemfile|pom\.xml|build\.gradle)$/i;
    LOCKFILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock)$/i;
    LINT = /(^|\/)(\.eslintrc|\.eslintrc\.(js|cjs|json|yml|yaml)|eslint\.config\.(js|cjs|mjs|ts)|ruff\.toml|\.prettierrc(\..+)?|prettier\.config\.(js|cjs|mjs)|biome\.json)$/i;
    TEST_TOOL = /(^|\/)(vitest\.config\.[cm]?[jt]s|jest\.config\.[cm]?[jt]s|pytest\.ini|conftest\.py|playwright\.config\.[cm]?[jt]s|cypress\.config\.[cm]?[jt]s)$/i;
    WORKFLOW = /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i;
    DEPENDABOT = /(^|\/)\.github\/dependabot\.ya?ml$/i;
    CODEOWNERS = /(^|\/)(\.github\/)?CODEOWNERS$/i;
    DOCKER = /(^|\/)(Dockerfile|Containerfile)(\.|$)/i;
    SRC_LAYOUT = /(^|\/)src\//;
    LICENSE = /(^|\/)LICENSE(\.|$)/i;
  }
});

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
    include_private: z.boolean().default(false),
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
    web_path: z.string().default("docs/index.html"),
    overview_path: z.string().default("OVERVIEW.md")
  }),
  privacy: z.object({
    mode: z.enum(["full", "public_only_render"]).default("public_only_render")
  }).default({ mode: "public_only_render" }),
  profile: z.object({
    enabled: z.boolean().default(false),
    repo: z.string().default(""),
    readme_path: z.string().default("README.md"),
    commit_message: z.string().default("chore(ruro): refresh profile portfolio truth"),
    /** Required when profile sync is enabled — never hardcode another identity. */
    commit_author_name: z.string().default(""),
    commit_author_email: z.string().default("")
  }).default({
    enabled: false,
    repo: "",
    readme_path: "README.md",
    commit_message: "chore(ruro): refresh profile portfolio truth",
    commit_author_name: "",
    commit_author_email: ""
  }),
  ai: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(["copilot", "none"]).default("none"),
    top_n: z.number().int().positive().default(5),
    cache_dir: z.string().default("data/ai"),
    /** Per-repo Copilot CLI timeout (ms). */
    timeout_ms: z.number().int().positive().default(18e4)
  }).default({
    enabled: false,
    provider: "none",
    top_n: 5,
    cache_dir: "data/ai",
    timeout_ms: 18e4
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
      include_private: false,
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
      web_path: "docs/index.html",
      overview_path: "OVERVIEW.md"
    },
    privacy: { mode: "public_only_render" },
    profile: {
      enabled: false,
      repo: `${owner}/${owner}`,
      readme_path: "README.md",
      commit_message: "chore(ruro): refresh profile portfolio truth",
      commit_author_name: "",
      commit_author_email: ""
    },
    ai: {
      enabled: false,
      provider: "none",
      top_n: 5,
      cache_dir: "data/ai",
      timeout_ms: 18e4
    }
  });
}

// src/ai/copilot.ts
import {
  existsSync as existsSync2,
  mkdirSync,
  mkdtempSync,
  readFileSync as readFileSync2,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve as resolve2 } from "node:path";
import { spawnSync } from "node:child_process";
var AI_CACHE_SCHEMA = 1;
async function annotateWithCopilot(opts) {
  const { report, config, cwd, token, signal } = opts;
  if (signal?.aborted) throw new Error("aborted");
  if (!config.ai.enabled || config.ai.provider !== "copilot") {
    return { annotated: 0, skipped: true, reason: "ai disabled", reviews: [] };
  }
  const cacheDir = resolve2(cwd, config.ai.cache_dir);
  mkdirSync(cacheDir, { recursive: true });
  if (!await commandExists("copilot")) {
    const stub = emptyPayload(
      "unavailable",
      "Copilot CLI not on PATH. Install @github/copilot and authenticate. Scores unchanged."
    );
    writeJson(join(cacheDir, "latest.json"), stub);
    return {
      annotated: 0,
      skipped: true,
      reason: "copilot cli missing",
      reviews: []
    };
  }
  const top = report.repos.slice(0, config.ai.top_n);
  const reviews = [];
  for (const repo of top) {
    if (signal?.aborted) throw new Error("aborted");
    const reviewed = await reviewOneRepo({
      repo,
      config,
      token: token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
      cacheDir
    });
    reviews.push(reviewed);
  }
  const ok = reviews.filter((r) => r.status === "ok");
  const payload = {
    schema_version: AI_CACHE_SCHEMA,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: "copilot",
    status: ok.length ? "reviewed" : "partial",
    note: "Judgment only \u2014 never moves scores. Embedded dossier; cite real paths.",
    repos: reviews
  };
  writeJson(join(cacheDir, "latest.json"), payload);
  return {
    annotated: ok.length,
    skipped: ok.length === 0,
    reason: ok.length ? void 0 : "all reviews failed or skipped",
    reviews
  };
}
async function reviewOneRepo(opts) {
  const { repo, config, token, cacheDir } = opts;
  const fullName = repo.signals.fullName;
  const safe = fullName.replace(/[^\w.-]+/g, "_");
  const base = {
    fullName,
    status: "skipped",
    score: repo.score,
    repoStatus: repo.status,
    why_showable: "",
    strengths: repo.drivers.slice(0, 5),
    weaknesses: repo.blockers.slice(0, 5),
    review: ""
  };
  if (!token) {
    return {
      ...base,
      status: "error",
      error: "missing token for clone",
      why_showable: signalWhy(repo),
      review: signalFallbackReview(repo)
    };
  }
  let work = null;
  try {
    work = mkdtempSync(join(tmpdir(), "ruro-review-"));
    const repoDir = join(work, "repo");
    const askpass = join(work, "askpass.sh");
    writeFileSync(
      askpass,
      [
        "#!/bin/sh",
        'case "$1" in',
        "  *Username*) echo x-access-token ;;",
        '  *) echo "$RURO_GIT_ASKPASS_TOKEN" ;;',
        "esac",
        ""
      ].join("\n"),
      { mode: 448 }
    );
    const clone = spawnSync(
      "git",
      [
        "-c",
        "credential.helper=",
        "clone",
        "--depth",
        "1",
        "--single-branch",
        `https://github.com/${fullName}.git`,
        repoDir
      ],
      {
        encoding: "utf8",
        timeout: 12e4,
        env: {
          ...process.env,
          GIT_ASKPASS: askpass,
          GIT_TERMINAL_PROMPT: "0",
          RURO_GIT_ASKPASS_TOKEN: token
        }
      }
    );
    if (clone.status !== 0) {
      throw new Error(
        redactSecrets(
          (clone.stderr || clone.stdout || "git clone failed").slice(0, 400),
          token
        )
      );
    }
    const dossier = buildRepoDossier(repoDir, repo);
    writeFileSync(join(repoDir, "RURO_DOSSIER.md"), dossier, "utf8");
    const embedded = dossier.slice(0, 28e3);
    const prompt = [
      "You are auditing a GitHub repo for portfolio truth.",
      "The SOURCE DOSSIER below was extracted from a fresh shallow clone. Treat it as ground truth.",
      "Do NOT claim permission errors. Do NOT say you cannot read the repo.",
      "Cite at least three concrete paths that appear in the dossier (e.g. package.json, src/...).",
      "Judge: real functional product vs thin glue; tests/CI; demo honesty; risks.",
      "Reply in markdown with exactly:",
      "## Why showable",
      "## Strengths",
      "## Weaknesses",
      "## Code review",
      "Be blunt. Under 450 words.",
      "",
      "===== SOURCE DOSSIER =====",
      embedded,
      "===== END DOSSIER ====="
    ].join("\n");
    const env = {
      ...process.env,
      COPILOT_GITHUB_TOKEN: token,
      GITHUB_TOKEN: token,
      GH_TOKEN: token
    };
    const result = spawnSync(
      "copilot",
      ["-p", prompt, "-s", "--no-ask-user"],
      {
        cwd: repoDir,
        encoding: "utf8",
        timeout: config.ai.timeout_ms,
        env,
        maxBuffer: 4 * 1024 * 1024
      }
    );
    const text = (result.stdout || "").trim() || (result.stderr || "").trim();
    if (!text) {
      throw new Error(
        `copilot exited ${result.status ?? "null"} with no output`
      );
    }
    if (/REVIEW_FAILED:\s*cannot read source/i.test(text)) {
      throw new Error(
        "copilot still refused to use the embedded dossier \u2014 check Copilot auth/credits"
      );
    }
    const hits = citationHits(text, dossier);
    if (hits.length < 2) {
      throw new Error(
        `audit rejected: need \u22652 dossier path citations (got ${hits.length}: ${hits.join(", ") || "none"}). Head: ${text.slice(0, 280)}`
      );
    }
    const parsed = parseReviewMarkdown(text, repo);
    const out = {
      ...base,
      status: "ok",
      why_showable: parsed.why_showable,
      strengths: parsed.strengths.length ? parsed.strengths : base.strengths,
      weaknesses: parsed.weaknesses.length ? parsed.weaknesses : base.weaknesses,
      review: `${parsed.review || text}

_Cited:_ ${hits.slice(0, 12).join(", ")}`
    };
    writeFileSync(join(cacheDir, `${safe}.md`), formatReviewMd(out), "utf8");
    writeJson(join(cacheDir, `${safe}.json`), out);
    return out;
  } catch (err) {
    const fallback = {
      ...base,
      status: "error",
      error: redactSecrets(
        err instanceof Error ? err.message : String(err),
        token ?? ""
      ),
      why_showable: signalWhy(repo),
      review: signalFallbackReview(repo)
    };
    writeFileSync(
      join(cacheDir, `${safe}.md`),
      formatReviewMd(fallback),
      "utf8"
    );
    writeJson(join(cacheDir, `${safe}.json`), fallback);
    return fallback;
  } finally {
    if (work) {
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
      }
    }
  }
}
function redactSecrets(text, token) {
  let out = text;
  if (token) {
    out = out.split(token).join("[redacted]");
  }
  return out.replace(/x-access-token:[^\s@/'"]+/gi, "x-access-token:[redacted]").replace(/bearer\s+[a-z0-9._-]+/gi, "bearer [redacted]").replace(/gh[pousr]_[A-Za-z0-9_]{10,}/g, "[redacted-token]");
}
function collectSourceFiles(root, limit = 10) {
  const out = [];
  const stack = [root];
  const skip = /* @__PURE__ */ new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
    "vendor",
    "target"
  ]);
  while (stack.length && out.length < limit) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (skip.has(name)) continue;
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (/\.(ts|tsx|js|jsx|py|go|rs|swift)$/i.test(name) && !/\.(test|spec)\./i.test(name)) {
        out.push(abs);
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}
function buildRepoDossier(repoDir, repo) {
  const lines = [
    `# Ruro dossier for ${repo.signals.fullName}`,
    "",
    `Status ${repo.status} \xB7 score ${repo.score}`,
    `Demo ${repo.signals.demo.status}${repo.signals.demo.verified ? " verified" : ""} url=${repo.signals.demo.url ?? "\u2014"}`,
    `Fitness ${repo.signals.fitness.score} (${repo.signals.fitness.sourceFiles} src / ${repo.signals.fitness.testFiles} tests)`,
    `Drivers: ${repo.drivers.join(", ")}`,
    `Blockers: ${repo.blockers.join(", ")}`,
    "",
    "## Tree (truncated)"
  ];
  const tree = spawnSync(
    "bash",
    [
      "-lc",
      "find . -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.py' -o -name '*.go' -o -name '*.rs' -o -name '*.md' -o -name 'package.json' -o -name 'pyproject.toml' -o -name 'Cargo.toml' -o -name 'go.mod' \\) ! -path './.git/*' ! -path './node_modules/*' ! -path './dist/*' ! -path './.next/*' | head -n 160"
    ],
    { cwd: repoDir, encoding: "utf8", timeout: 15e3 }
  );
  lines.push((tree.stdout || "").trim() || "(no files listed)");
  lines.push("", "## Key file previews");
  const candidates = [
    "README.md",
    "readme.md",
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod"
  ];
  for (const rel of candidates) {
    const abs = join(repoDir, rel);
    if (!existsSync2(abs)) continue;
    try {
      const raw = readFileSync2(abs, "utf8").slice(0, 2200);
      lines.push("", `### ${rel}`, "```", raw, "```");
    } catch {
    }
  }
  for (const abs of collectSourceFiles(repoDir, 8)) {
    const rel = relative(repoDir, abs);
    try {
      const raw = readFileSync2(abs, "utf8").slice(0, 1600);
      lines.push("", `### ${rel}`, "```", raw, "```");
    } catch {
    }
  }
  return `${lines.join("\n")}
`;
}
function extractCitedPaths(text) {
  const found = /* @__PURE__ */ new Set();
  const re = /(?:^|[\s`"'(])((?:\.\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:tsx|jsx|mjs|cjs|json|toml|yaml|yml|swift|java|sql|css|ts|js|py|go|rs|md|kt))(?=[\s`"'),.:;!?]|$)/gim;
  let m;
  while ((m = re.exec(text)) !== null) {
    found.add(m[1].replace(/^\.\//, ""));
  }
  const bare = /\b(README\.md|package\.json|pyproject\.toml|Cargo\.toml|go\.mod|Dockerfile)\b/gi;
  while ((m = bare.exec(text)) !== null) found.add(m[1]);
  return [...found];
}
function listKnownPaths(dossier) {
  const paths = [];
  for (const line of dossier.split("\n")) {
    const t = line.trim();
    if (t.startsWith("./") || /^[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|md|json|toml)$/.test(t)) {
      paths.push(t.replace(/^\.\//, ""));
    }
    if (t.startsWith("### ")) paths.push(t.slice(4).trim());
  }
  return paths;
}
function citationHits(text, dossier) {
  const cited = extractCitedPaths(text);
  const known = listKnownPaths(dossier);
  return cited.filter(
    (p) => known.some((k) => k.endsWith(p) || k.includes(`/${p}`) || k === p)
  );
}
function parseReviewMarkdown(text, repo) {
  const why = section(text, "Why showable") || section(text, "Why Showable") || signalWhy(repo);
  const strengths = bullets(section(text, "Strengths"));
  const weaknesses = bullets(section(text, "Weaknesses"));
  const review = section(text, "Code review") || section(text, "Code Review") || text;
  return { why_showable: why, strengths, weaknesses, review };
}
function section(text, title) {
  const re = new RegExp(
    `##\\s*${title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    "i"
  );
  const m = text.match(re);
  return m?.[1]?.trim() ?? "";
}
function bullets(block) {
  if (!block) return [];
  return block.split("\n").map((l) => l.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim()).filter((l) => l.length > 0).slice(0, 8);
}
function signalWhy(repo) {
  return `${repo.signals.name} ranks ${repo.status} at score ${repo.score}. Drivers: ${repo.drivers.slice(0, 4).join(", ") || "\u2014"}.`;
}
function signalFallbackReview(repo) {
  return [
    `Signal-only fallback (Copilot review unavailable).`,
    `Blockers: ${repo.blockers.slice(0, 5).join(", ") || "\u2014"}.`,
    `Demo: ${repo.signals.demo.status}${repo.signals.demo.verified ? " verified" : ""}.`
  ].join(" ");
}
function formatReviewMd(r) {
  return [
    `# ${r.fullName}`,
    "",
    `Status: ${r.repoStatus} \xB7 Score: ${r.score} \xB7 Review: ${r.status}`,
    "",
    "## Why showable",
    r.why_showable || "\u2014",
    "",
    "## Strengths",
    ...r.strengths.map((s) => `- ${s}`) || ["- \u2014"],
    "",
    "## Weaknesses",
    ...r.weaknesses.map((s) => `- ${s}`) || ["- \u2014"],
    "",
    "## Code review",
    r.review || "\u2014",
    r.error ? `

_Error:_ ${r.error}` : "",
    ""
  ].join("\n");
}
function emptyPayload(status, note2) {
  return {
    schema_version: AI_CACHE_SCHEMA,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: "copilot",
    status,
    note: note2,
    repos: []
  };
}
function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}
`, "utf8");
}
async function commandExists(bin) {
  try {
    const result = spawnSync(bin, ["--help"], {
      stdio: "ignore",
      timeout: 3e3
    });
    return result.status === 0 || result.status === 1;
  } catch {
    return false;
  }
}
function readAiCache(cwd, cacheDir) {
  const path = resolve2(cwd, cacheDir, "latest.json");
  if (!existsSync2(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync2(path, "utf8"));
    if (!Array.isArray(parsed.repos)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// src/cli/tui.ts
var ansi = {
  reset: "\x1B[0m",
  dim: "\x1B[2m",
  bold: "\x1B[1m",
  italic: "\x1B[3m",
  lime: "\x1B[38;2;214;255;60m",
  sand: "\x1B[38;2;196;184;160m",
  mute: "\x1B[38;2;120;116;108m",
  ink: "\x1B[38;2;244;241;234m",
  red: "\x1B[38;2;255;92;77m",
  sky: "\x1B[38;2;125;211;252m"
};
function c(kind, text) {
  if (!process.stdout.isTTY) return text;
  return `${ansi[kind]}${text}${ansi.reset}`;
}
function say(text) {
  for (const line of text.split("\n")) {
    console.log(`  ${line}`);
  }
}
function agent(text) {
  console.log("");
  console.log(`${c("lime", "\u25CF")} ${c("bold", "ruri")} ${c("mute", "\xB7")}`);
  for (const line of text.split("\n")) {
    console.log(`  ${c("ink", line)}`);
  }
  console.log("");
}
function note(text) {
  console.log(`  ${c("mute", text)}`);
}
function item(text) {
  console.log(`  ${c("lime", "\xB7")} ${text}`);
}
function tool(label) {
  console.log(`  ${c("mute", "\u21B3")} ${c("sand", label)}`);
}
function printSlashMenu(commands, title = "commands") {
  if (!commands.length) {
    console.log("");
    console.log(`  ${c("mute", "no matching commands")}`);
    console.log("");
    return 3;
  }
  const lines = [];
  lines.push("");
  lines.push(
    `  ${c("lime", "\u25CF")} ${c("bold", "ruri")} ${c("mute", `\xB7 /${title}`)}`
  );
  lines.push("");
  const width = Math.max(
    ...commands.map((x) => {
      const label = x.args ? `/${x.cmd} ${x.args}` : `/${x.cmd}`;
      return label.length;
    }),
    12
  );
  for (const x of commands) {
    const label = x.args ? `/${x.cmd} ${x.args}` : `/${x.cmd}`;
    lines.push(
      `  ${c("lime", label.padEnd(width))}  ${c("mute", x.description)}`
    );
  }
  lines.push("");
  lines.push(
    c("mute", "  tab completes \xB7 enter runs \xB7 esc clears")
  );
  lines.push("");
  for (const l of lines) console.log(l);
  return lines.length;
}
function eraseSlashMenu(lineCount) {
  if (!lineCount || !process.stdout.isTTY) return;
  for (let i = 0; i < lineCount; i += 1) {
    process.stdout.write("\x1B[1A\x1B[2K");
  }
}
function startProgress(label) {
  const t0 = Date.now();
  const tty = Boolean(process.stdout.isTTY);
  let frame = 0;
  const frames = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
  let timer = null;
  let last = label;
  const render = () => {
    if (!tty) return;
    const spin = frames[frame % frames.length];
    frame += 1;
    const sec = ((Date.now() - t0) / 1e3).toFixed(1);
    process.stdout.write(
      `\r  ${c("mute", "\u21B3")} ${c("sand", `${spin} ${last}`)} ${c("mute", `${sec}s`)}   `
    );
  };
  if (tty) {
    render();
    timer = setInterval(render, 80);
  } else {
    tool(`${label}\u2026`);
  }
  const clearLine = () => {
    if (tty) process.stdout.write("\r" + " ".repeat(72) + "\r");
  };
  return {
    tick(msg) {
      if (msg) last = msg;
    },
    done(msg) {
      if (timer) clearInterval(timer);
      clearLine();
      const sec = ((Date.now() - t0) / 1e3).toFixed(1);
      tool(`${msg ?? last} \xB7 ${sec}s`);
    },
    fail(msg) {
      if (timer) clearInterval(timer);
      clearLine();
      tool(`${msg ?? last} \xB7 failed`);
    }
  };
}
function printBoot(meta) {
  const bar = c("mute", "\u2500".repeat(56));
  const L = (s) => c("lime", s);
  const M = (s) => c("mute", s);
  const S = (s) => c("sand", s);
  const B = (s) => c("bold", c("ink", s));
  console.log("");
  console.log(bar);
  console.log(L("        .--.      "));
  console.log(L("       |o_o |     ") + B("  RURI"));
  console.log(L("       |:_/ |     ") + S("  ruro fleet operator"));
  console.log(L("      //   \\ \\    ") + M("  github os \xB7 prove \xB7 operate"));
  console.log(L("     (|     | )   "));
  console.log(L("    /'\\_   _/`\\   "));
  console.log(L("    \\___)=(___/   "));
  console.log("");
  console.log(
    `  ${c("bold", c("ink", "RURO"))} ${c("mute", "v0.3.0")}  ${c("lime", "\u25B8")} ${c("sand", "live")}`
  );
  if (meta?.owner) {
    console.log(
      c(
        "mute",
        `  owner=${meta.owner}${meta.repos != null ? `  repos=${meta.repos}` : ""}`
      )
    );
  }
  console.log(
    c(
      "mute",
      "  type / for menu (opens live) \xB7 tab \xB7 enter \xB7 /exit"
    )
  );
  console.log(bar);
  console.log("");
}

// src/cli/banner.ts
function ruriArt() {
  const L = (s) => c("lime", s);
  const M = (s) => c("mute", s);
  const S = (s) => c("sand", s);
  const B = (s) => c("bold", c("ink", s));
  return [
    L("        .--.      "),
    L("       |o_o |     ") + B("  RURI"),
    L("       |:_/ |     ") + S("  ruro fleet operator"),
    L("      //   \\ \\    ") + M("  github os \xB7 no vibes"),
    L("     (|     | )   "),
    L("    /'\\_   _/`\\   "),
    L("    \\___)=(___/   ")
  ].join("\n");
}
function printBanner(cmd) {
  const bar = c("mute", "\u2500".repeat(56));
  console.log("");
  console.log(bar);
  console.log(ruriArt());
  console.log(
    `  ${c("bold", c("ink", "RURO"))} ${c("mute", "v0.3.0")}  ${c("lime", "\u25B8")} ${c("sand", cmd)}`
  );
  console.log(
    c("mute", "  scan \xB7 view \xB7 top \xB7 status \xB7 why \xB7 review")
  );
  console.log(bar);
  console.log("");
}

// src/history/regressions.ts
import { existsSync as existsSync3, readdirSync as readdirSync2, readFileSync as readFileSync3 } from "node:fs";
import { join as join2, resolve as resolve3 } from "node:path";
function computeRegressions(previous, current) {
  if (!previous) return [];
  const prevMap = new Map(previous.repos.map((r) => [r.signals.fullName, r]));
  const out = [];
  for (const repo of current.repos) {
    const prior = prevMap.get(repo.signals.fullName);
    if (!prior) continue;
    if (prior.status !== repo.status) {
      out.push({
        kind: "status_flip",
        fullName: repo.signals.fullName,
        name: repo.signals.name,
        detail: `${prior.status} \u2192 ${repo.status}`
      });
    }
    if (repo.score <= prior.score - 5) {
      out.push({
        kind: "score_drop",
        fullName: repo.signals.fullName,
        name: repo.signals.name,
        detail: `score ${prior.score} \u2192 ${repo.score}`
      });
    }
    if (prior.signals.demo.verified && !repo.signals.demo.verified) {
      out.push({
        kind: "demo_lost",
        fullName: repo.signals.fullName,
        name: repo.signals.name,
        detail: `lost verified deploy (${repo.signals.demo.error ?? repo.signals.demo.status})`
      });
    }
    const priorBlock = new Set(prior.blockers);
    for (const b of repo.blockers) {
      if (!priorBlock.has(b) && /no_ci|demo_|homepage_|ci_failing|no_tests/.test(b)) {
        out.push({
          kind: "new_blocker",
          fullName: repo.signals.fullName,
          name: repo.signals.name,
          detail: `new blocker: ${b}`
        });
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
function loadPreviousHistory(historyDir, cwd, currentGeneratedAt) {
  const root = resolve3(cwd, historyDir);
  if (!existsSync3(root)) return null;
  const days = readdirSync2(root).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.replace(/\.json$/, "")).sort().reverse();
  const currentDay = currentGeneratedAt.slice(0, 10);
  for (const day of days) {
    if (day >= currentDay) continue;
    try {
      const parsed = JSON.parse(
        readFileSync3(join2(root, `${day}.json`), "utf8")
      );
      if (parsed?.schema_version === 1 && Array.isArray(parsed.repos)) return parsed;
    } catch {
    }
  }
  return null;
}
function topHurts(repos, n = 5) {
  const rows = [];
  for (const repo of repos) {
    for (const b of repo.blockers.slice(0, 3)) {
      const weight = (b.includes("demo") || b.includes("ci") || b.includes("test") ? 3 : 1) + (100 - repo.score) / 100;
      rows.push({ repo, blocker: b, weight });
    }
  }
  return rows.sort((a, b) => b.weight - a.weight).slice(0, n).map(({ repo, blocker }) => ({ repo, blocker }));
}

// src/ops/playbook.ts
var PLAYBOOK = {
  no_ci: "Add .github/workflows/ci.yml that runs tests on push/PR.",
  no_tests_detected: "Add at least one real test file under tests/ or *.test.* / *_test.*.",
  thin_readme: "Write a README \u2265800 bytes: what it is, how to run, one screenshot/link.",
  weak_description: "Set a GitHub description (\u226520 chars) that a stranger understands.",
  no_license: "Add a LICENSE file (MIT/Apache) and set the repo license metadata.",
  no_topics: "Add \u22653 topics (language, domain, type) on the repo settings page.",
  demo_unproven: "Fix the homepage deploy so the probe gets HTTP 2xx + real body.",
  homepage_unproven: "Point homepage at a live product URL \u2014 not github.com/owner/repo.",
  homepage_is_github_repo_not_deploy: "Replace homepage with the real deploy URL.",
  parking_or_soft_404: "Redeploy; probe saw parking/soft-404 content.",
  god_file: "Split or gitignore huge generated blobs (>250KB).",
  no_source_files: "Push real source files \u2014 tree looks empty/docs-only.",
  tiny_tree: "Grow the tree past a stub (more than a handful of files).",
  stub_sized: "Ship real code + tests; disk usage looks like a placeholder.",
  ci_failing: "Fix the latest failing workflow on the default branch.",
  fork: "Prefer a non-fork showcase repo, or document why the fork is yours.",
  quiet_long: "Push meaningful commits within the active window.",
  very_quiet: "Revive the repo or archive it honestly.",
  never_pushed: "Push an initial commit.",
  no_language: "Ensure GitHub detects a primary language (real source files)."
};
function playbookFor(code) {
  if (PLAYBOOK[code]) return PLAYBOOK[code];
  if (code.startsWith("HTTP")) return "Fix the deploy HTTP status so the probe passes.";
  return `Address signal \`${code}\` (see why / BIBLE).`;
}

// src/score/explain.ts
var SIGNAL_EXPLAIN = {
  manifest: "Package/manifest file present (package.json, pyproject, go.mod, Cargo.toml, \u2026).",
  substantial_code: "Repo disk usage suggests more than a stub (\u2265200KB).",
  code_fitness_high: "Tree scan found nontrivial source + healthy test signal (fitness \u226570).",
  code_fitness_ok: "Tree scan found real source files (fitness \u226545).",
  no_source_files: "Tree scan found almost no source files \u2014 looks empty or docs-only.",
  tiny_tree: "Very few files in the tree \u2014 likely incomplete or placeholder.",
  test_files_in_tree: "Test files detected in the git tree (not just a script name).",
  god_file: "At least one huge non-binary blob \u2014 possible generated dump or unmaintainable file.",
  src_layout: "Has a src/ directory.",
  containerized: "Dockerfile/Containerfile present.",
  tests_present: "Tests heuristically detected (dirs, configs, or test scripts).",
  test_script: "package.json/pyproject declares a runnable test script/tool.",
  no_tests_detected: "No tests/dirs/scripts detected \u2014 quality pillar takes a hit.",
  ci_workflows: ".github/workflows YAML present.",
  no_ci: "No CI workflows found.",
  ci_green: "Latest workflow run on default branch concluded success.",
  ci_failing: "Latest workflow run failed.",
  lint_config: "Lint/format config detected (eslint, ruff, prettier, \u2026).",
  dependabot: "Dependabot config present.",
  lockfile: "Dependency lockfile present.",
  codeowners: "CODEOWNERS present.",
  stub_sized: "Tiny disk usage + no tests \u2014 treated as stub risk.",
  no_language: "No primary language and very small disk \u2014 weak signal of real code.",
  demo_verified: "Homepage answered HTTP with proof (SPA shell or real body) \u2014 not github.com/repo.",
  demo_unproven: "Homepage claimed but probe failed or was not verified.",
  homepage_unproven: "Homepage URL set but not verified live.",
  parking_or_soft_404: "Response looked like parking/soft-404 (or empty non-SPA HTML).",
  homepage_is_github_repo_not_deploy: "Homepage points at github.com/owner/repo \u2014 not a product deploy.",
  redirected_to_github_repo: "Homepage redirected to the GitHub repo page.",
  empty_or_tiny_response: "HTTP ok but body too small to count as a real page.",
  pushed_2w: "Pushed within the last 14 days.",
  pushed_active_window: "Pushed within the active window (config active_days).",
  pushed_stale_window: "Pushed in the stale window \u2014 still some alive signal.",
  high_cadence_30d: "\u22655 commits in last 30 days.",
  cadence_30d: "\u22651 commit in last 30 days.",
  cadence_90d: "\u22653 commits in last 90 days (no 30d activity).",
  quiet_long: "Quiet past stale threshold.",
  very_quiet: "Quiet past dormant threshold.",
  never_pushed: "No push timestamp.",
  has_releases: "At least one GitHub release.",
  recent_release: "Release within ~180 days.",
  ci_fresh: "Successful workflow within last 30 days.",
  description: "Description \u226520 chars.",
  weak_description: "Missing/short description.",
  readme_substance: "README \u2265800 bytes.",
  readme_basic: "README \u2265200 bytes.",
  thin_readme: "README missing or very thin.",
  license: "LICENSE file or SPDX license detected.",
  no_license: "No license signal.",
  topics: "\u22653 topics set.",
  no_topics: "No topics.",
  homepage_verified: "Homepage URL verified by probe.",
  has_language: "Primary language detected by GitHub.",
  owner_authored: "\u226570% of sampled commits authored by the fleet owner.",
  low_owner_share: "Owner authored <30% of sampled commits \u2014 vanity/fork risk.",
  ci_matrix_green: "Last 3\u20135 workflow runs all succeeded.",
  ci_matrix_red: "Last 3\u20135 workflow runs all failed.",
  fork: "Repository is a fork \u2014 structure penalty."
};
function explainCode(code) {
  if (SIGNAL_EXPLAIN[code]) return SIGNAL_EXPLAIN[code];
  if (SIGNAL_EXPLAIN[code.replace(/_/g, "_")]) {
    return SIGNAL_EXPLAIN[code];
  }
  return `Signal code \`${code}\` (see BIBLE / score module).`;
}
function explainContribution(c2) {
  const sign = c2.delta > 0 ? `+${c2.delta}` : String(c2.delta);
  return `${c2.code} (${c2.pillar} ${sign}): ${explainCode(c2.code)}`;
}
function explainScoreLine(score, pillars, weights) {
  const q = weights.quality * pillars.quality;
  const a = weights.alive * pillars.alive;
  const s = weights.structure * pillars.structure;
  return [
    `showability = ${weights.quality}*quality + ${weights.alive}*alive + ${weights.structure}*structure`,
    `           = ${weights.quality}*${pillars.quality} + ${weights.alive}*${pillars.alive} + ${weights.structure}*${pillars.structure}`,
    `           \u2248 ${q.toFixed(1)} + ${a.toFixed(1)} + ${s.toFixed(1)} \u2192 ${score}`
  ];
}

// src/cli/slash.ts
var SLASH_COMMANDS = [
  {
    cmd: "brief",
    description: "Operator briefing \u2014 show path, regressions, next fixes"
  },
  {
    cmd: "next",
    description: "Highest-leverage blockers with concrete playbook steps"
  },
  {
    cmd: "diff",
    description: "Fleet regressions vs previous history day"
  },
  {
    cmd: "view",
    description: "Fleet show path (ranked shortlist)"
  },
  {
    cmd: "top",
    args: "[n]",
    description: "Top N repos by showability (default 5)"
  },
  {
    cmd: "status",
    args: "<repo>",
    description: "Short dossier + auditable deploy proof"
  },
  {
    cmd: "full",
    args: "<repo>",
    description: "Long dossier with explained drivers/blockers"
  },
  {
    cmd: "why",
    args: "<repo>",
    description: "Score math, biggest movers, playbook fixes"
  },
  {
    cmd: "scan",
    description: "Refresh GitHub truth, probes, proofs (needs token)"
  },
  {
    cmd: "review",
    args: "<repo>",
    description: "Optional Copilot judgment \u2014 never moves scores"
  },
  {
    cmd: "reload",
    description: "Reload latest.json from disk"
  },
  {
    cmd: "clear",
    description: "Clear the screen and redraw Ruri boot"
  },
  {
    cmd: "help",
    description: "Show this command menu"
  },
  {
    cmd: "exit",
    description: "Leave the live session"
  }
];
function filterSlashCommands(prefix) {
  const p = prefix.replace(/^\//, "").toLowerCase();
  if (!p) return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter((c2) => c2.cmd.startsWith(p));
}
function resolveSlashPrefix(prefix) {
  const hits = filterSlashCommands(prefix);
  if (hits.length === 1) return hits[0];
  const exact = hits.find((h) => h.cmd === prefix.replace(/^\//, "").toLowerCase());
  return exact ?? null;
}

// src/cli/narrate.ts
function deployLabel(repo) {
  const d = repo.signals.demo;
  if (d.verified) {
    const hash = d.bodyHash ? ` \xB7 #${d.bodyHash}` : "";
    return `verified (${d.latencyMs ?? "\u2014"}ms${hash})`;
  }
  if (d.status === "NONE") return "no deploy url";
  return `unproven (${d.status}${d.error ? `: ${d.error}` : ""})`;
}
function proofLines(repo) {
  const d = repo.signals.demo;
  if (d.status === "NONE" && !d.url) return ["No deploy probe (no homepage)."];
  const lines = [
    `probe ${d.status}${d.verified ? " VERIFIED" : ""} \xB7 ${d.httpStatus ?? "\u2014"} \xB7 ${d.latencyMs ?? "\u2014"}ms \xB7 ${d.proofBytes ?? "\u2014"}B`,
    `final ${d.finalUrl ?? "\u2014"}`
  ];
  if (d.bodyHash) {
    lines.push(
      `hash ${d.bodyHash}${d.hashStable === true ? " \xB7 stable" : d.hashStable === false ? " \xB7 unstable" : ""}`
    );
  }
  if (d.spaShell) lines.push("SPA shell detected (mount + bundles + title)");
  if (d.redirectChain?.length) lines.push(`chain ${d.redirectChain.join(" \u2192 ")}`);
  if (d.probedAt) lines.push(`probed ${d.probedAt.slice(0, 19)}`);
  return lines;
}
function oneLiner(r, i) {
  return `${c("mute", String(i + 1).padStart(2))}  ${c("bold", r.signals.name)}  ${r.status}  ${c("lime", String(r.score))}  ${c("mute", deployLabel(r))}`;
}
function narrateView(report) {
  const live = report.repos.filter((r) => r.status === "LIVE");
  const verified = report.repos.filter((r) => r.signals.demo.verified);
  const lead = report.repos[0];
  agent(
    [
      `${report.owner} fleet \u2014 ${report.included_count} in scope \xB7 ${live.length} LIVE \xB7 ${verified.length} verified deploys.`,
      lead ? `Lead: ${lead.signals.name} \xB7 ${lead.status} \xB7 ${lead.score}.` : "Nothing scored yet \u2014 run scan."
    ].join("\n")
  );
  for (const [i, r] of report.repos.slice(0, 10).entries()) {
    say(oneLiner(r, i));
  }
  if (report.repos.length > 10) {
    note(`+${report.repos.length - 10} more \u2014 try \u201Ctop 15\u201D or /brief`);
  }
  note("brief \xB7 next \xB7 diff \xB7 why <repo> \xB7 status <repo>");
  console.log("");
}
function narrateTop(report, n) {
  const top = report.repos.slice(0, Math.max(1, n));
  agent(`Top ${top.length} by showability.`);
  for (const [i, r] of top.entries()) {
    say(`${c("lime", `${i + 1}.`)} ${c("bold", r.signals.name)}  ${r.status} ${r.score}`);
    note(
      `Q${r.pillars.quality} A${r.pillars.alive} S${r.pillars.structure} \xB7 ${deployLabel(r)} \xB7 fit ${r.signals.fitness.score}`
    );
    note(`\u2191 ${r.drivers.slice(0, 3).map((d) => `${d} (${explainCode(d).slice(0, 40)}\u2026)`).join(" \xB7 ") || "\u2014"}`);
    note(`\u2193 ${r.blockers.slice(0, 3).map((b) => `${b}`).join(", ") || "\u2014"}`);
    console.log("");
  }
}
function narrateStatus(report, query) {
  const repo = findIn(report, query);
  const s = repo.signals;
  agent(
    [
      `${repo.signals.fullName}`,
      `${repo.status} \xB7 score ${repo.score} \xB7 Q${repo.pillars.quality} A${repo.pillars.alive} S${repo.pillars.structure}`,
      `Tree: ${s.fitness.sourceFiles} src \xB7 ${s.fitness.testFiles} tests \xB7 fit ${s.fitness.score} \xB7 ${s.primaryLanguage ?? "\u2014"}`,
      `Cadence: push ${s.pushedAt?.slice(0, 10) ?? "\u2014"} \xB7 ${s.commitsLast30Days}/30d \xB7 owner share ${s.ownerCommitShare ?? "\u2014"}%`,
      `CI: ${(s.ciConclusions ?? []).length ? (s.ciConclusions ?? []).join(",") : s.hasWorkflows ? "workflows" : "none"}`
    ].join("\n")
  );
  note("deploy proof");
  for (const line of proofLines(repo)) say(line);
  if (repo.drivers.length) {
    note("raised");
    for (const d of repo.drivers.slice(0, 5)) item(`${d} \u2014 ${explainCode(d)}`);
  }
  if (repo.blockers.length) {
    note("hurt \u2192 fix");
    for (const b of repo.blockers.slice(0, 5)) {
      item(`${b} \u2014 ${playbookFor(b)}`);
    }
  }
  note(`why ${s.name} \xB7 full ${s.name} \xB7 next`);
  console.log("");
}
function narrateFull(report, query) {
  const repo = findIn(report, query);
  const s = repo.signals;
  narrateStatus(report, query);
  agent(`Detail \u2014 ${s.name}`);
  say(`${c("mute", "url")}     ${s.url}`);
  for (const line of proofLines(repo)) say(line);
  say(`${c("mute", "flags")}   ${s.fitness.flags.join(", ") || "\u2014"}`);
  say(`${c("mute", "langs")}   ${(s.languages || []).join(", ") || "\u2014"}`);
  say(
    `${c("mute", "readme")}  ${s.readmeBytes ?? 0}B \xB7 license ${s.licenseSpdx ?? (s.hasLicenseFile ? "file" : "none")}`
  );
  console.log("");
}
function narrateWhy(report, config, query) {
  const repo = findIn(report, query);
  agent(`Why ${repo.signals.name} is ${repo.score}`);
  for (const line of explainScoreLine(repo.score, repo.pillars, config.weights)) {
    say(line);
  }
  console.log("");
  note("biggest movers");
  const contribs = [...repo.contributions ?? []].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta)
  );
  for (const row of contribs.filter((x) => x.delta !== 0).slice(0, 10)) {
    item(explainContribution(row));
  }
  console.log("");
  note("hurt \u2192 fix");
  if (!repo.blockers.length) item("(none)");
  for (const b of repo.blockers.slice(0, 6)) {
    item(`${b}: ${playbookFor(b)}`);
  }
  console.log("");
}
function narrateBrief(report, config, cwd = process.cwd()) {
  const live = report.repos.filter((r) => r.status === "LIVE");
  const verified = report.repos.filter((r) => r.signals.demo.verified);
  const prev = loadPreviousHistory(config.render.history_dir, cwd, report.generated_at) ?? null;
  const regs = report.regressions?.length ? report.regressions : computeRegressions(prev, report);
  agent(
    [
      `Operator brief \xB7 ${report.owner}`,
      `${report.included_count} repos \xB7 ${live.length} LIVE \xB7 ${verified.length} verified deploys \xB7 snapshot ${report.generated_at.slice(0, 16)}`
    ].join("\n")
  );
  note("show path (top 5)");
  for (const [i, r] of report.repos.slice(0, 5).entries()) {
    item(
      `${r.signals.name} \xB7 ${r.status} ${r.score} \xB7 ${deployLabel(r)}`
    );
    void i;
  }
  if (regs.length) {
    note("regressions");
    for (const r of regs.slice(0, 8)) {
      item(`${r.name}: ${r.detail}`);
    }
  } else {
    note("regressions \u2014 none vs previous history");
  }
  note("next actions");
  for (const { repo, blocker } of topHurts(report.repos, 5)) {
    item(`${repo.signals.name} \xB7 ${blocker} \u2192 ${playbookFor(blocker)}`);
  }
  console.log("");
}
function narrateNext(report) {
  agent("Next actions \u2014 highest-leverage blockers.");
  for (const { repo, blocker } of topHurts(report.repos, 8)) {
    item(`${repo.signals.name} [${repo.status} ${repo.score}]`);
    say(`  ${blocker} \u2014 ${explainCode(blocker)}`);
    say(`  \u2192 ${playbookFor(blocker)}`);
  }
  console.log("");
}
function narrateDiff(report, config, cwd = process.cwd()) {
  const prev = loadPreviousHistory(
    config.render.history_dir,
    cwd,
    report.generated_at
  );
  const regs = report.regressions?.length ? report.regressions : computeRegressions(prev, report);
  if (!prev && !regs.length) {
    agent("No prior history day to diff. Run scan again tomorrow \u2014 or after another scorecard.");
    return;
  }
  agent(
    `Diff vs ${prev ? prev.generated_at.slice(0, 10) : "previous"} \xB7 ${regs.length} regressions`
  );
  if (!regs.length) {
    note("Fleet stable \u2014 no status flips, score drops \u22655, or lost verifies.");
    console.log("");
    return;
  }
  for (const r of regs) {
    item(`[${r.kind}] ${r.name}: ${r.detail}`);
  }
  if (report.transitions?.length) {
    note("status transitions");
    for (const t of report.transitions.slice(0, 10)) {
      item(`${t.name}: ${t.from} \u2192 ${t.to} (${t.scoreFrom}\u2192${t.scoreTo})`);
    }
  }
  console.log("");
}
function narrateReview(cache, filter) {
  if (!cache?.repos.length) {
    agent(
      "No Copilot audit cached. Optional garnish \u2014 try brief / why / next first. Or: review <repo>"
    );
    return;
  }
  const q = filter?.toLowerCase();
  const items = q ? cache.repos.filter(
    (r) => r.fullName.toLowerCase().includes(q) || r.fullName.toLowerCase().endsWith(`/${q}`)
  ) : cache.repos;
  if (!items.length) {
    agent(`No audit found for ${filter}.`);
    return;
  }
  for (const r of items) {
    if (r.status !== "ok") {
      agent(
        `Audit \xB7 ${r.fullName} \xB7 ${r.status} (judgment failed \u2014 scores unchanged)`
      );
      if (r.error) say(c("red", r.error));
      console.log("");
      continue;
    }
    agent(`Audit \xB7 ${r.fullName} \xB7 judgment only (not score)`);
    note("Copilot commentary \u2014 use why/brief for deterministic truth.");
    if (r.why_showable) say(r.why_showable);
    console.log("");
    if (r.strengths.length) {
      note("strengths");
      for (const s of r.strengths) item(s);
    }
    if (r.weaknesses.length) {
      note("weaknesses");
      for (const w of r.weaknesses) item(w);
    }
    console.log("");
    note("review");
    say(r.review || "\u2014");
    console.log("");
  }
}
function findIn(report, query) {
  const q = query.toLowerCase();
  const repo = report.repos.find(
    (r) => r.signals.name.toLowerCase() === q || r.signals.fullName.toLowerCase() === q || r.signals.fullName.toLowerCase().endsWith(`/${q}`)
  );
  if (!repo) throw new Error(`No repo matching \u201C${query}\u201D in the latest scan.`);
  return repo;
}
function intentFromSlash(cmd, rest) {
  if (cmd === "view") return { kind: "view" };
  if (cmd === "scan") return { kind: "scan" };
  if (cmd === "brief") return { kind: "brief" };
  if (cmd === "next") return { kind: "next" };
  if (cmd === "diff") return { kind: "diff" };
  if (cmd === "help") return { kind: "help" };
  if (cmd === "exit") return { kind: "exit" };
  if (cmd === "clear") return { kind: "clear" };
  if (cmd === "reload") return { kind: "reload" };
  if (cmd === "top") {
    const n = rest ? Number.parseInt(rest, 10) : 5;
    return { kind: "top", n: Number.isFinite(n) ? n : 5 };
  }
  if (cmd === "status") return { kind: "status", arg: rest || void 0 };
  if (cmd === "full") return { kind: "full", arg: rest || void 0 };
  if (cmd === "why" || cmd === "explain")
    return { kind: "why", arg: rest || void 0 };
  if (cmd === "review") return { kind: "review", arg: rest || void 0 };
  return { kind: "unknown" };
}
function parseIntent(line) {
  const raw = line.trim();
  const lower = raw.toLowerCase();
  if (!raw) return { kind: "empty" };
  if (/^(exit|quit|q|\/exit|\/quit)$/i.test(raw)) return { kind: "exit" };
  if (/^(help|\?|\/help)$/i.test(raw)) return { kind: "help" };
  if (/^(clear|\/clear)$/i.test(raw)) return { kind: "clear" };
  if (/^(reload|\/reload)$/i.test(raw)) return { kind: "reload" };
  if (raw === "/") return { kind: "menu" };
  const menuOnly = raw.match(/^\/([a-z]+)$/i);
  if (menuOnly) {
    const partial = menuOnly[1].toLowerCase();
    const resolved = resolveSlashPrefix(partial);
    if (!resolved) return { kind: "menu", arg: partial };
    return intentFromSlash(resolved.cmd, "");
  }
  const slash = raw.match(
    /^\/(view|top|status|full|why|review|scan|explain|brief|next|diff|help|exit|clear|reload)\s*(.*)$/i
  );
  if (slash) {
    return intentFromSlash(slash[1].toLowerCase(), slash[2].trim());
  }
  if (/^(view|fleet|list|show(\s+fleet)?)$/i.test(lower)) return { kind: "view" };
  if (/^(brief|ops|operator)$/i.test(lower)) return { kind: "brief" };
  if (/^(next|actions|todo)$/i.test(lower)) return { kind: "next" };
  if (/^(diff|regressions?)$/i.test(lower)) return { kind: "diff" };
  if (/^scan$/i.test(lower) || /refresh|rescan/.test(lower))
    return { kind: "scan" };
  const topM = lower.match(/^top\s*(\d+)?$/);
  if (topM) {
    return { kind: "top", n: topM[1] ? Number.parseInt(topM[1], 10) : 5 };
  }
  if (/^(status|inspect)$/i.test(raw)) return { kind: "status" };
  if (/^(full|detail|dossier)$/i.test(raw)) return { kind: "full" };
  if (/^(why|explain)$/i.test(raw)) return { kind: "why" };
  if (/^(review|audit)$/i.test(raw)) return { kind: "review" };
  const fullM = raw.match(/^(?:full|detail|dossier)\s+(.+)$/i);
  if (fullM) return { kind: "full", arg: fullM[1].trim() };
  const statusM = raw.match(
    /^(?:status|inspect|show|tell me about|what about)\s+(.+)$/i
  );
  if (statusM) return { kind: "status", arg: statusM[1].trim() };
  const whyM = raw.match(/^(?:why|explain)\s+(.+)$/i);
  if (whyM) return { kind: "why", arg: whyM[1].trim() };
  const reviewM = raw.match(/^(?:review|audit)\s+(.+)$/i);
  if (reviewM) return { kind: "review", arg: reviewM[1].trim() };
  if (/^[\w.-]+$/.test(raw) && raw.length > 1 && !/^(status|why|review|full|view|top|scan|help|exit|quit|reload|clear|audit|explain|inspect|dossier|detail|brief|next|diff|ops|actions|todo)$/i.test(
    raw
  )) {
    return { kind: "status", arg: raw };
  }
  return { kind: "unknown" };
}

// src/cli/repl.ts
import * as readline from "node:readline";

// src/cli/view.ts
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "node:fs";
import { resolve as resolve4 } from "node:path";
function normalizeReport(report) {
  return {
    ...report,
    regressions: report.regressions ?? [],
    repos: report.repos.map(normalizeRepo)
  };
}
function normalizeRepo(repo) {
  const s = repo.signals;
  const fitness = s.fitness ?? {
    score: 0,
    sourceFiles: 0,
    testFiles: 0,
    otherFiles: 0,
    maxBlobBytes: 0,
    flags: []
  };
  return {
    ...repo,
    drivers: repo.drivers ?? [],
    blockers: repo.blockers ?? [],
    contributions: repo.contributions ?? [],
    signals: {
      ...s,
      ciConclusions: s.ciConclusions ?? [],
      ownerCommitShare: s.ownerCommitShare ?? null,
      languages: s.languages ?? [],
      topics: s.topics ?? [],
      fitness: {
        ...fitness,
        flags: fitness.flags ?? []
      }
    }
  };
}
function loadLatestReport(config, cwd = process.cwd()) {
  const path = resolve4(cwd, config.render.data_path);
  if (!existsSync4(path)) {
    throw new Error(`No scorecard data at ${path}. Run \`ruro scan\` first.`);
  }
  const parsed = JSON.parse(readFileSync4(path, "utf8"));
  if (parsed?.schema_version !== 1 || !Array.isArray(parsed.repos)) {
    throw new Error(`Invalid scorecard data at ${path}`);
  }
  return normalizeReport(parsed);
}
function findRepo(report, query) {
  const q = query.toLowerCase();
  const repo = report.repos.find(
    (r) => r.signals.name.toLowerCase() === q || r.signals.fullName.toLowerCase() === q || r.signals.fullName.toLowerCase().endsWith(`/${q}`)
  );
  if (!repo) {
    throw new Error(`Repo not found in latest scorecard: ${query}`);
  }
  return repo;
}

// src/run.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync2, readFileSync as readFileSync6, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname, join as join3, resolve as resolve6 } from "node:path";

// src/github/collect.ts
init_retry();
import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";
function createClients(token) {
  const octokit = new Octokit({ auth: token, userAgent: "ruro/0.2" });
  const gqlClient = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
      "user-agent": "ruro/0.2"
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
function mapRepo(node, now, ownerLogin) {
  const history = node.defaultBranchRef?.target?.history;
  const commitDates = history?.nodes.map((n) => n.committedDate) ?? [];
  const readmeText = node.object?.text ?? null;
  const latestReleaseAt = node.releases.nodes[0]?.publishedAt ?? node.releases.nodes[0]?.createdAt ?? null;
  const authors = history?.nodes ?? [];
  let ownerShare = null;
  if (authors.length > 0) {
    const mine = authors.filter(
      (n) => n.author?.user?.login?.toLowerCase() === ownerLogin.toLowerCase()
    ).length;
    ownerShare = Math.round(mine / authors.length * 100);
  }
  const totalHint = history?.totalCount;
  const commits365 = totalHint != null && totalHint > commitDates.length ? Math.min(totalHint, countCommitsSince(commitDates, now, 365) + (totalHint - commitDates.length)) : countCommitsSince(commitDates, now, 365);
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
      hashStable: null
    },
    fitness: {
      sourceFiles: 0,
      testFiles: 0,
      otherFiles: 0,
      maxBlobBytes: 0,
      score: 0,
      flags: ["pending"]
    }
  };
}
async function collectRepoSignals(clients, config, signal) {
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
    if (signal?.aborted) throw new Error("aborted");
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
      collected.push(mapRepo(node, now, config.owner));
    }
    hasNext = conn.pageInfo.hasNextPage;
    cursor = conn.pageInfo.endCursor;
  }
  if (signal?.aborted) throw new Error("aborted");
  const { enrichCodeFitness: enrichCodeFitness2 } = await Promise.resolve().then(() => (init_code(), code_exports));
  await enrichCodeFitness2(clients, collected);
  if (signal?.aborted) throw new Error("aborted");
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
          per_page: 5,
          branch: repo.defaultBranch ?? void 0
        }),
        { attempts: 3, baseDelayMs: 250 }
      );
      const runs = data.workflow_runs ?? [];
      if (!runs.length) continue;
      repo.ciConclusions = runs.map(
        (r) => r.conclusion ?? r.status ?? "unknown"
      );
      const run = runs[0];
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
import { createHash } from "node:crypto";
var PARKING_MARKERS = [
  "buy this domain",
  "domain is for sale",
  "parked domain",
  "coming soon",
  "under construction",
  "this site can\u2019t be reached",
  "this site can't be reached",
  "404 not found",
  "page not found",
  "deployment not found",
  "project not found",
  "vercel 404",
  "netlify 404",
  "there isn't a github pages site here",
  "failed to find a valid digest"
];
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
function isBlockedProbeHost(hostname) {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "metadata.google.internal") return true;
  if (host === "metadata" || host.endsWith(".metadata.google.internal"))
    return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map((x) => Number(x));
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (host.includes(":")) {
    if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host.includes("::ffff:127.") || host.includes("::ffff:10.") || host.includes("::ffff:192.168.") || host.includes("::ffff:169.254.")) {
      return true;
    }
  }
  return false;
}
function isGithubRepoUrl(candidate, ctx) {
  try {
    const u = new URL(candidate);
    if (!/(^|\.)github\.com$/i.test(u.hostname)) return false;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return false;
    if (ctx.fullName) {
      const [o, r] = ctx.fullName.split("/");
      if (parts[0]?.toLowerCase() === o?.toLowerCase() && parts[1]?.toLowerCase() === r?.toLowerCase()) {
        return true;
      }
    }
    if (ctx.repoHtmlUrl) {
      const repo = new URL(ctx.repoHtmlUrl);
      return u.hostname === repo.hostname && u.pathname.replace(/\/$/, "") === repo.pathname.replace(/\/$/, "");
    }
    return !u.hostname.endsWith("github.io");
  } catch {
    return false;
  }
}
function isSpaShell(body) {
  const lower = body.toLowerCase();
  const hasMount = /id=["']root["']/.test(lower) || /id=["']app["']/.test(lower) || /id=["']__next["']/.test(lower) || /data-reactroot/.test(lower);
  const hasBundles = /type=["']module["']/.test(lower) || /\/assets\/[^"']+\.js/.test(lower) || /_next\/static/.test(lower) || /vite\.svg/.test(lower);
  const title = lower.match(/<title[^>]*>([^<]{3,120})<\/title>/);
  const hasTitle = Boolean(title?.[1]?.trim() && !/document/i.test(title[1]));
  return hasMount && hasBundles && hasTitle;
}
function looksParkedOrFake(body, contentType) {
  const lower = body.slice(0, 8e4).toLowerCase();
  if (PARKING_MARKERS.some((m) => lower.includes(m))) return true;
  if (isSpaShell(body)) return false;
  const isHtml = !contentType || contentType.includes("text/html") || contentType.includes("application/xhtml");
  if (isHtml) {
    const textish = lower.replace(/<script[\s\S]*?<\/script>/g, " ");
    const stripped = textish.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length < 40) return true;
  }
  return false;
}
function emptyResult(status, patch = {}) {
  return {
    status,
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
    probedAt: (/* @__PURE__ */ new Date()).toISOString(),
    hashStable: null,
    ...patch
  };
}
function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}
async function fetchOnce(url, config, signal) {
  const started = Date.now();
  const response = await fetch(url, {
    method: "GET",
    redirect: config.probes.follow_redirects ? "follow" : "manual",
    signal,
    headers: {
      "user-agent": config.probes.user_agent,
      accept: "text/html,application/json;q=0.9,*/*;q=0.8"
    }
  });
  const buf = Buffer.from(await response.arrayBuffer());
  return {
    response,
    buf,
    latencyMs: Date.now() - started,
    finalUrl: response.url || url
  };
}
async function probeDemoUrl(homepageUrl, config, ctx = {}) {
  if (!config.probes.enabled) {
    return emptyResult("NONE", {
      url: homepageUrl ?? null,
      verified: false,
      probedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  const url = homepageUrl ? normalizeUrl(homepageUrl) : null;
  if (!url) return emptyResult("NONE");
  if (isGithubRepoUrl(url, ctx)) {
    return emptyResult("DOWN", {
      url,
      finalUrl: url,
      error: "homepage_is_github_repo_not_deploy",
      redirectChain: [url]
    });
  }
  try {
    const host = new URL(url).hostname;
    if (isBlockedProbeHost(host)) {
      return emptyResult("DOWN", {
        url,
        finalUrl: url,
        error: "homepage_blocked_ssrf",
        redirectChain: [url]
      });
    }
  } catch {
    return emptyResult("NONE");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.probes.timeout_ms);
  if (ctx.signal) {
    if (ctx.signal.aborted) {
      clearTimeout(timer);
      return emptyResult("ERROR", {
        url,
        error: "aborted"
      });
    }
    ctx.signal.addEventListener("abort", () => controller.abort(), {
      once: true
    });
  }
  try {
    const first = await fetchOnce(url, config, controller.signal);
    const { response, buf, latencyMs, finalUrl } = first;
    const contentType = response.headers.get("content-type");
    const proofBytes = buf.byteLength;
    const bodyText = buf.toString("utf8");
    const bodyHash = sha256(buf);
    const spaShell = isSpaShell(bodyText);
    const redirectChain = finalUrl && finalUrl !== url ? [url, finalUrl] : [url];
    if (isGithubRepoUrl(finalUrl, ctx)) {
      return emptyResult("DOWN", {
        url,
        finalUrl,
        httpStatus: response.status,
        latencyMs,
        error: "redirected_to_github_repo",
        proofBytes,
        contentType,
        redirectChain,
        bodyHash,
        spaShell
      });
    }
    try {
      const finalHost = new URL(finalUrl).hostname;
      if (isBlockedProbeHost(finalHost)) {
        return emptyResult("DOWN", {
          url,
          finalUrl,
          httpStatus: response.status,
          latencyMs,
          error: "redirected_to_blocked_host",
          proofBytes,
          contentType,
          redirectChain,
          bodyHash,
          spaShell
        });
      }
    } catch {
    }
    const httpOk = response.status >= 200 && response.status < 400;
    if (!httpOk) {
      return emptyResult("DOWN", {
        url,
        finalUrl,
        httpStatus: response.status,
        latencyMs,
        error: `HTTP ${response.status}`,
        proofBytes,
        contentType,
        redirectChain,
        bodyHash,
        spaShell
      });
    }
    if (proofBytes < 64) {
      return emptyResult("DOWN", {
        url,
        finalUrl,
        httpStatus: response.status,
        latencyMs,
        error: "empty_or_tiny_response",
        proofBytes,
        contentType,
        redirectChain,
        bodyHash,
        spaShell
      });
    }
    if (looksParkedOrFake(bodyText, contentType)) {
      return emptyResult("DOWN", {
        url,
        finalUrl,
        httpStatus: response.status,
        latencyMs,
        error: "parking_or_soft_404",
        proofBytes,
        contentType,
        redirectChain,
        bodyHash,
        spaShell
      });
    }
    let hashStable = null;
    try {
      const second = await fetchOnce(finalUrl, config, controller.signal);
      hashStable = sha256(second.buf) === bodyHash;
    } catch {
      hashStable = null;
    }
    return {
      status: "UP",
      url,
      finalUrl,
      httpStatus: response.status,
      latencyMs,
      error: null,
      proofBytes,
      contentType,
      verified: true,
      redirectChain,
      bodyHash,
      spaShell,
      probedAt: (/* @__PURE__ */ new Date()).toISOString(),
      hashStable
    };
  } catch (err) {
    return emptyResult("ERROR", {
      url,
      finalUrl: null,
      latencyMs: null,
      error: err instanceof Error ? err.message : String(err)
    });
  } finally {
    clearTimeout(timer);
  }
}
async function probeAll(repos, config, concurrency = 6, signal) {
  const results = new Array(repos.length);
  let index = 0;
  async function worker() {
    while (index < repos.length) {
      if (signal?.aborted) {
        throw new Error("aborted");
      }
      const current = index;
      index += 1;
      const repo = repos[current];
      results[current] = await probeDemoUrl(repo.homepageUrl, config, {
        repoHtmlUrl: repo.url,
        fullName: repo.fullName,
        signal
      });
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, repos.length)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// src/profile/sync.ts
init_retry();
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
  const written = await withRetries(`profile:put:${profile.repo}`, () => {
    const name = profile.commit_author_name.trim() || process.env.RURO_GIT_NAME?.trim() || "";
    const email = profile.commit_author_email.trim() || process.env.RURO_GIT_EMAIL?.trim() || "";
    if (!name || !email) {
      throw new Error(
        "profile sync needs profile.commit_author_name + profile.commit_author_email (or RURO_GIT_NAME / RURO_GIT_EMAIL)"
      );
    }
    return octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: profile.commit_message,
      content: Buffer.from(next, "utf8").toString("base64"),
      sha: file.sha,
      committer: { name, email },
      author: { name, email }
    });
  });
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
    "- **Status**: `LIVE` = verified deploy **and** push within `active_days` \xB7 `ACTIVE` recent without LIVE \xB7 `STALE`/`DORMANT` quiet \xB7 `DEAD` abandoned \xB7 `ARCHIVED`",
    "- **Demo**: `UP`/`DOWN`/`NONE`/`ERROR` from homepage probe (`verified` is separate from status)",
    "- Notes prefixed with `!` are blockers",
    "",
    "---",
    "_Ruro core is zero-AI. Same inputs \u21D2 same scores. Copilot audit is optional judgment._",
    ""
  );
  return lines.join("\n");
}

// src/render/profile.ts
function escXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function renderProfileSvg(report, config) {
  const top = report.repos.slice(0, Math.min(4, config.render.profile_top_n));
  const generated = report.generated_at.slice(0, 16).replace("T", " ");
  const live = report.repos.filter((r) => r.signals.demo.verified).length;
  const lines = top.map((repo, i) => {
    const deploy = repo.signals.demo.verified ? "verified" : repo.signals.demo.status.toLowerCase();
    const y = 118 + i * 28;
    const delay = (0.6 + i * 0.35).toFixed(2);
    return `
  <text class="fade" style="animation-delay:${delay}s" x="28" y="${y}" fill="#d6ff3c" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${i + 1}. ${escXml(repo.signals.name)}</text>
  <text class="fade" style="animation-delay:${delay}s" x="572" y="${y}" fill="#8a867c" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="end">${escXml(repo.status)} ${repo.score} \xB7 ${escXml(deploy)}</text>`;
  });
  const height = 150 + top.length * 28 + 56;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${height}" viewBox="0 0 600 ${height}" role="img" aria-label="Ruro CLI terminal">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#030303"/>
      <stop offset="100%" stop-color="#0a0a0a"/>
    </linearGradient>
    <style>
      @keyframes blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
      @keyframes fadein { from{opacity:0} to{opacity:1} }
      .cursor { animation: blink 1.1s step-end infinite; }
      .fade { opacity:0; animation: fadein 0.45s ease forwards; }
    </style>
  </defs>
  <rect width="600" height="${height}" rx="14" fill="url(#bg)"/>
  <rect x="1" y="1" width="598" height="${height - 2}" rx="13" fill="none" stroke="#222"/>
  <circle cx="28" cy="28" r="5" fill="#ff5c4d"/>
  <circle cx="46" cy="28" r="5" fill="#ffc14d"/>
  <circle cx="64" cy="28" r="5" fill="#d6ff3c"/>
  <text x="90" y="32" fill="#8a867c" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">ruro \u2014 github os</text>
  <text class="fade" style="animation-delay:0.1s" x="28" y="68" fill="#8a867c" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">$</text>
  <text class="fade" style="animation-delay:0.1s" x="44" y="68" fill="#f4f1ea" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">ruro view</text>
  <rect class="cursor" x="128" y="56" width="8" height="16" fill="#d6ff3c"/>
  <text class="fade" style="animation-delay:0.35s" x="28" y="92" fill="#8a867c" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${report.included_count} fleet \xB7 ${live} verified live \xB7 ${escXml(generated)} UTC</text>
${lines.join("\n")}
  <text class="fade" style="animation-delay:2s" x="28" y="${height - 20}" fill="#8a867c" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">$ ruro review &lt;repo&gt;   \xB7   npx \xB7 pages \xB7 deterministic core</text>
</svg>
`;
}
function renderOverview(report, config) {
  const top = report.repos.slice(0, config.render.profile_top_n);
  const live = report.repos.filter((r) => r.signals.demo.verified).length;
  const svgRel = config.render.profile_svg_path;
  const osUrl = `https://${config.owner}.github.io/ruro/`;
  const rows = top.map((r) => {
    const demo = r.signals.demo.verified ? "verified" : r.signals.demo.status === "NONE" ? "none" : "unproven";
    return `| **[${r.signals.name}](${r.signals.url})** | \`${r.status}\` | **${r.score}** | ${r.signals.primaryLanguage ?? "\u2014"} | ${demo} |`;
  }).join("\n");
  return `# Overview

GitHub OS for \`${config.owner}\` \u2014 automatic truth, verified deploys, optional Copilot judgment.

<div align="center">

<a href="${osUrl}"><img src="./${svgRel}" width="600" alt="Ruro CLI terminal" /></a>

</div>

\`\`\`text
$ ruro view
  ${report.included_count} fleet \xB7 ${live} verified live \xB7 ${report.generated_at.slice(0, 16).replace("T", " ")} UTC
\`\`\`

| Project | Status | Score | Stack | Deploy |
|---|---|---:|---|---|
${rows}

**Surfaces**

| File | Role |
| --- | --- |
| [README.md](./README.md) | Product + CLI |
| [OVERVIEW.md](./OVERVIEW.md) | This living fleet snapshot |
| [LICENSE](./LICENSE) | MIT |
| [docs/](./docs/) | Pages OS |
| [DASHBOARD.md](./DASHBOARD.md) | Full markdown scorecard |

<sub>Generated ${report.generated_at} \xB7 [Open OS](${osUrl})</sub>
`;
}
function renderProfileSnippet(report, config) {
  const top = report.repos.slice(0, config.render.profile_top_n);
  const svgPath = config.render.profile_svg_path;
  const cardUrl = `https://raw.githubusercontent.com/${config.owner}/ruro/main/${svgPath}`;
  const osUrl = `https://${config.owner}.github.io/ruro/`;
  const rows = top.map((r) => {
    const demo = r.signals.demo.verified ? "verified" : r.signals.demo.status === "NONE" ? "none" : "unproven";
    return `| **[${r.signals.name}](${r.signals.url})** | \`${r.status}\` | **${r.score}** | ${r.signals.primaryLanguage ?? "\u2014"} | ${demo} |`;
  }).join("\n");
  return `<!-- RURO:START -->
## \u2591 RURO

GitHub OS for my repos \u2014 automatic truth, verified deploys, optional Copilot judgment.

<div align="center">

<a href="${osUrl}"><img src="${cardUrl}" width="600" alt="Ruro CLI terminal" /></a>

</div>

\`\`\`bash
npx --yes tsx github.com/${config.owner}/ruro  # or clone + npm run ruro -- view
\`\`\`

| Project | Status | Score | Stack | Deploy |
|---|---|---:|---|---|
${rows}

<sub>[Open OS](${osUrl}) \xB7 [Ruro](https://github.com/${config.owner}/ruro) \xB7 ${report.generated_at.slice(0, 10)}</sub>
<!-- RURO:END -->
`;
}

// src/render/web.ts
import { existsSync as existsSync5, readFileSync as readFileSync5 } from "node:fs";
import { resolve as resolve5 } from "node:path";
function esc2(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function loadAiReviews(config, cwd = process.cwd()) {
  const path = resolve5(cwd, config.ai.cache_dir, "latest.json");
  if (!existsSync5(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync5(path, "utf8"));
    return Array.isArray(parsed.repos) ? parsed.repos : [];
  } catch {
    return [];
  }
}
function attentionItems(report) {
  const byName = new Map(report.repos.map((r) => [r.signals.fullName, r]));
  const fromRegs = (report.regressions ?? []).map((r) => byName.get(r.fullName)).filter((r) => Boolean(r));
  const uniq = new Map(fromRegs.map((r) => [r.signals.fullName, r]));
  for (const r of report.repos) {
    if (uniq.size >= 6) break;
    if (r.blockers.some(
      (b) => /demo_|homepage_unproven|ci_failing|no_tests|no_source|tiny_tree|no_ci/.test(
        b
      )
    ) || r.signals.homepageUrl && !r.signals.demo.verified) {
      uniq.set(r.signals.fullName, r);
    }
  }
  return [...uniq.values()].slice(0, 6);
}
function liveVerified(report) {
  return report.repos.filter((r) => r.signals.demo.verified);
}
function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short"
    });
  } catch {
    return iso;
  }
}
function renderWebDashboard(report, config, cwd = process.cwd()) {
  const aiReviews = loadAiReviews(config, cwd);
  const attention = attentionItems(report);
  const live = liveVerified(report);
  const lead = report.repos[0];
  const show = report.repos.slice(0, 4);
  const liveCount = live.length;
  const attentionCount = attention.length;
  const attentionHtml = attention.length === 0 ? `<p class="empty">Nothing urgent. Keep building.</p>` : attention.map(
    (r) => `<a class="row" href="${esc2(r.signals.url)}" target="_blank" rel="noreferrer">
  <span class="row-name">${esc2(r.signals.name)}</span>
  <span class="row-meta">${esc2(r.blockers.slice(0, 2).join(" \xB7 ") || r.status)}</span>
  <span class="row-go" aria-hidden="true">\u2192</span>
</a>`
  ).join("\n");
  const liveHtml = live.length === 0 ? `<p class="empty">No deployment passed verification. Claimed URLs do not count.</p>` : live.map((r) => {
    const d = r.signals.demo;
    const href = d.finalUrl || d.url || r.signals.url;
    return `<a class="proof" href="${esc2(href)}" target="_blank" rel="noreferrer">
  <span class="proof-name">${esc2(r.signals.name)}</span>
  <span class="proof-stat">${d.latencyMs ?? "\u2014"}ms</span>
</a>`;
  }).join("\n");
  const showHtml = show.map((r, i) => {
    const n = String(i + 1).padStart(2, "0");
    const deploy = r.signals.demo.verified ? "verified" : r.signals.demo.status.toLowerCase();
    return `<a class="show" href="${esc2(r.signals.url)}" target="_blank" rel="noreferrer" style="--i:${i}">
  <span class="show-i">${n}</span>
  <span class="show-body">
    <span class="show-name">${esc2(r.signals.name)}</span>
    <span class="show-line">${esc2(r.status)} \xB7 ${r.score} \xB7 fitness ${r.signals.fitness?.score ?? 0} \xB7 deploy ${esc2(deploy)}</span>
  </span>
</a>`;
  }).join("\n");
  const aiHtml = aiReviews.filter((r) => r.status === "ok" || r.review).length === 0 ? `<p class="empty">No deep review yet. Run <code>ruro review &lt;repo&gt;</code> when you want file-aware judgment.</p>` : aiReviews.slice(0, 3).map(
    (r) => `<article class="brief">
  <h3>${esc2(r.fullName.split("/")[1] ?? r.fullName)}</h3>
  <p>${esc2((r.why_showable || "").slice(0, 220))}${(r.why_showable || "").length > 220 ? "\u2026" : ""}</p>
  <p class="brief-weak">${esc2((r.weaknesses ?? []).slice(0, 3).join(" \xB7 ") || "\u2014")}</p>
</article>`
  ).join("\n");
  const fleetRows = report.repos.map((r, i) => {
    const deploy = r.signals.demo.verified ? "verified" : r.signals.demo.status.toLowerCase();
    return `<tr>
  <td class="num">${i + 1}</td>
  <td><a href="${esc2(r.signals.url)}" target="_blank" rel="noreferrer">${esc2(r.signals.name)}</a></td>
  <td><span class="mark mark-${r.status.toLowerCase()}">${esc2(r.status)}</span></td>
  <td class="num">${r.score}</td>
  <td class="num">${r.signals.fitness?.score ?? 0}</td>
  <td><span class="mark mark-${deploy}">${esc2(deploy)}</span></td>
  <td>${esc2(r.signals.primaryLanguage ?? "\u2014")}</td>
</tr>`;
  }).join("\n");
  const leadLine = lead ? `${lead.signals.name} leads at ${lead.score}.` : "Fleet awaiting first scan.";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ruro \u2014 GitHub OS</title>
  <meta name="description" content="GitHub-native operating surface. Automatic truth. Deployed means verified." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Syne:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #030303;
      --fg: #f4f1ea;
      --mute: #8a867c;
      --line: rgba(244,241,234,0.12);
      --lime: #d6ff3c;
      --sand: #c4b8a0;
      --bad: #ff5c4d;
      --ok: #d6ff3c;
      --warn: #ffc14d;
      --pad: clamp(20px, 4vw, 48px);
      --max: 1120px;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      color: var(--fg);
      background: var(--bg);
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 14px;
      line-height: 1.5;
      overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }
    code { color: var(--lime); font-family: inherit; }

    .veil {
      position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background:
        radial-gradient(ellipse 80% 50% at 50% -10%, rgba(214,255,60,0.09), transparent 55%),
        radial-gradient(ellipse 50% 40% at 100% 20%, rgba(196,184,160,0.06), transparent 50%),
        linear-gradient(180deg, #030303 0%, #070707 100%);
    }
    .veil::after {
      content: "";
      position: absolute; inset: 0;
      background-image: linear-gradient(rgba(244,241,234,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(244,241,234,0.03) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: radial-gradient(ellipse at 50% 0%, #000 20%, transparent 70%);
      animation: drift 28s linear infinite;
    }
    @keyframes drift {
      from { transform: translateY(0); }
      to { transform: translateY(64px); }
    }

    .wrap { position: relative; z-index: 1; }

    .hero {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: var(--pad);
      padding-bottom: clamp(40px, 8vh, 80px);
      max-width: var(--max);
      margin: 0 auto;
    }
    .brand {
      font-family: Syne, sans-serif;
      font-weight: 800;
      font-size: clamp(4.8rem, 18vw, 11rem);
      line-height: 0.82;
      letter-spacing: -0.06em;
      margin: 0;
      opacity: 0;
      animation: rise 1s cubic-bezier(0.16,1,0.3,1) 0.05s forwards;
    }
    .brand em {
      font-style: normal;
      color: var(--lime);
    }
    .headline {
      font-family: "Instrument Serif", Georgia, serif;
      font-weight: 400;
      font-size: clamp(1.6rem, 3.6vw, 2.6rem);
      line-height: 1.15;
      max-width: 16ch;
      margin: 28px 0 14px;
      opacity: 0;
      animation: rise 1s cubic-bezier(0.16,1,0.3,1) 0.18s forwards;
    }
    .sub {
      color: var(--mute);
      max-width: 36rem;
      margin: 0 0 28px;
      font-size: 13px;
      opacity: 0;
      animation: rise 1s cubic-bezier(0.16,1,0.3,1) 0.28s forwards;
    }
    .cta {
      display: flex; flex-wrap: wrap; gap: 12px;
      opacity: 0;
      animation: rise 1s cubic-bezier(0.16,1,0.3,1) 0.38s forwards;
    }
    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 18px;
      border: 1px solid var(--fg);
      background: var(--fg);
      color: var(--bg);
      font-family: Syne, sans-serif;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.02em;
      transition: transform 0.25s ease, background 0.25s ease, color 0.25s ease;
    }
    .btn:hover { transform: translateY(-2px); }
    .btn-ghost {
      background: transparent;
      color: var(--fg);
    }
    .btn-ghost:hover { background: rgba(244,241,234,0.06); }
    .pulse {
      width: 8px; height: 8px; background: var(--lime);
      animation: blink 2.2s ease-in-out infinite;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.25; }
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(28px); }
      to { opacity: 1; transform: translateY(0); }
    }

    section {
      max-width: var(--max);
      margin: 0 auto;
      padding: 72px var(--pad);
      border-top: 1px solid var(--line);
    }
    .sec-kicker {
      font-family: Syne, sans-serif;
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--lime);
      margin: 0 0 10px;
    }
    .sec-title {
      font-family: "Instrument Serif", Georgia, serif;
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 400;
      margin: 0 0 12px;
      max-width: 14ch;
      line-height: 1.1;
    }
    .sec-copy {
      color: var(--mute);
      max-width: 34rem;
      margin: 0 0 32px;
      font-size: 13px;
    }

    .split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
    }
    @media (max-width: 840px) {
      .split { grid-template-columns: 1fr; gap: 40px; }
    }

    .row, .proof, .show {
      display: flex; align-items: baseline; gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid var(--line);
      transition: color 0.2s ease, padding-left 0.25s ease;
    }
    .row:hover, .proof:hover, .show:hover {
      color: var(--lime);
      padding-left: 6px;
    }
    .row-name, .proof-name, .show-name {
      font-family: Syne, sans-serif;
      font-weight: 700;
      font-size: 16px;
      min-width: 0;
    }
    .row-meta, .show-line {
      color: var(--mute);
      font-size: 12px;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row:hover .row-meta, .show:hover .show-line { color: rgba(214,255,60,0.7); }
    .row-go, .proof-stat {
      color: var(--mute);
      font-size: 12px;
      margin-left: auto;
    }
    .proof-stat { color: var(--lime); }

    .show { opacity: 0; animation: rise 0.8s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay: calc(0.08s * var(--i) + 0.1s); }
    .show-i {
      font-family: "Instrument Serif", Georgia, serif;
      font-size: 28px;
      color: var(--sand);
      width: 2.2ch;
    }
    .show-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

    .meter {
      display: flex; gap: 28px; flex-wrap: wrap;
      margin-top: 8px;
    }
    .meter div { min-width: 88px; }
    .meter strong {
      display: block;
      font-family: Syne, sans-serif;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1;
      margin-bottom: 6px;
    }
    .meter span { color: var(--mute); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }

    .brief {
      padding: 20px 0;
      border-bottom: 1px solid var(--line);
    }
    .brief h3 {
      font-family: Syne, sans-serif;
      font-size: 18px;
      margin: 0 0 8px;
    }
    .brief p { margin: 0 0 8px; color: var(--fg); max-width: 52rem; }
    .brief-weak { color: var(--mute) !important; font-size: 12px; }

    .empty { color: var(--mute); margin: 0; }

    .fleet-wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      text-align: left;
      color: var(--mute);
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 10px;
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
    }
    td {
      padding: 12px 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: middle;
    }
    td a:hover { color: var(--lime); }
    .num { font-variant-numeric: tabular-nums; color: var(--mute); }
    .mark {
      display: inline-block;
      padding: 2px 6px;
      border: 1px solid var(--line);
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .mark-live, .mark-verified { border-color: var(--ok); color: var(--ok); }
    .mark-active { border-color: var(--sand); color: var(--sand); }
    .mark-stale, .mark-dormant, .mark-warn { border-color: var(--warn); color: var(--warn); }
    .mark-dead, .mark-down, .mark-error { border-color: var(--bad); color: var(--bad); }
    .mark-archived, .mark-none { color: var(--mute); }

    footer {
      max-width: var(--max);
      margin: 0 auto;
      padding: 28px var(--pad) 64px;
      color: var(--mute);
      font-size: 11px;
      border-top: 1px solid var(--line);
      display: flex;
      flex-wrap: wrap;
      gap: 12px 24px;
      justify-content: space-between;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      .brand, .headline, .sub, .cta, .show { opacity: 1; transform: none; }
    }
  </style>
</head>
<body>
  <div class="veil" aria-hidden="true"></div>
  <div class="wrap">
    <header class="hero">
      <h1 class="brand">RURO<em>.</em></h1>
      <p class="headline">Prove. Remember. Operate.</p>
      <p class="sub">GitHub OS for <code>${esc2(report.owner)}</code>. Auditable deploys \xB7 contribution scores \xB7 regressions. Run <code>npm run ruro</code> \u2192 <code>brief</code>. ${esc2(leadLine)}</p>
      <div class="cta">
        <a class="btn" href="#proven"><span class="pulse" aria-hidden="true"></span> Proven deploys</a>
        <a class="btn btn-ghost" href="#fleet">Fleet map</a>
      </div>
    </header>

    <section id="signal" aria-label="Signal">
      <p class="sec-kicker">Signal</p>
      <h2 class="sec-title">What is true right now</h2>
      <p class="sec-copy">Refreshed ${esc2(fmtWhen(report.generated_at))}. Same inputs \u21D2 same scores. This is the operating pulse \u2014 not a vanity chart.</p>
      <div class="meter">
        <div><strong>${report.included_count}</strong><span>in fleet</span></div>
        <div><strong>${liveCount}</strong><span>verified live</span></div>
        <div><strong>${attentionCount}</strong><span>need attention</span></div>
        <div><strong>${report.status_counts.LIVE ?? 0}</strong><span>live status</span></div>
      </div>
    </section>

    <section aria-label="Work">
      <div class="split">
        <div>
          <p class="sec-kicker">Attention</p>
          <h2 class="sec-title">Fix these first</h2>
          <p class="sec-copy">Regressions and blockers the OS will not politely ignore.</p>
          ${attentionHtml}
        </div>
        <div id="proven">
          <p class="sec-kicker">Proven</p>
          <h2 class="sec-title">Deployments that answered</h2>
          <p class="sec-copy">Auditable probe: hash, SPA shell, redirects \u2014 not a homepage string on GitHub.</p>
          ${liveHtml}
        </div>
      </div>
    </section>

    <section aria-label="Showables">
      <p class="sec-kicker">Show path</p>
      <h2 class="sec-title">What to open in an interview</h2>
      <p class="sec-copy">Ranked by showability. Fitness is without-AI tree truth. LIVE = verified deploy and recent push (active_days). Deploy \u201Cverified\u201D is separate from status.</p>
      <div>${showHtml}</div>
    </section>

    <section aria-label="Judgment">
      <p class="sec-kicker">Judgment</p>
      <h2 class="sec-title">Optional judgment</h2>
      <p class="sec-copy">Copilot garnish only. Never moves scores. Prefer <code>brief</code> / <code>why</code> in the CLI for truth.</p>
      ${aiHtml}
    </section>

    <section id="fleet" aria-label="Fleet">
      <p class="sec-kicker">Fleet</p>
      <h2 class="sec-title">Every owned repo</h2>
      <p class="sec-copy">Full inventory. Scroll when you need the whole map.</p>
      <div class="fleet-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Repo</th><th>Status</th><th>Score</th>
              <th>Fitness</th><th>Deploy</th><th>Stack</th>
            </tr>
          </thead>
          <tbody>${fleetRows}</tbody>
        </table>
      </div>
    </section>

    <footer>
      <span>Ruro \xB7 GitHub OS \xB7 ${esc2(report.owner)}</span>
      <span>Pages from /docs \xB7 CLI: <code>ruro brief</code> \xB7 <code>ruro why</code></span>
    </footer>
  </div>
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
var BASE = {
  quality: 18,
  alive: 0,
  structure: 15
};
function qualityFeatures(s) {
  const out = [];
  const q = (code, delta) => {
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
    q("no_tests_detected", 0);
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
function aliveFeatures(s, thresholds, now) {
  const out = [];
  const a = (code, delta) => {
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
  if (s.recentWorkflowConclusion === "success" && s.recentWorkflowAgeDays !== null && s.recentWorkflowAgeDays <= 30) {
    a("ci_fresh", 7);
  }
  if (s.ciConclusions.length >= 3) {
    const ok = s.ciConclusions.filter((c2) => c2 === "success").length;
    if (ok === s.ciConclusions.length) a("ci_matrix_green", 5);
    else if (ok === 0) a("ci_matrix_red", -6);
  }
  return out;
}
function structureFeatures(s) {
  const out = [];
  const st = (code, delta) => {
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
function pillarFrom(pillar, features) {
  const sum = features.filter((f) => f.pillar === pillar).reduce((acc, f) => acc + f.delta, 0);
  return clamp(BASE[pillar] + sum);
}
var HURT_CODES = /* @__PURE__ */ new Set([
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
  "ci_matrix_red"
]);
function driversFrom(features) {
  return [
    ...new Set(
      features.filter((f) => f.delta > 0 && !HURT_CODES.has(f.code)).map((f) => f.code)
    )
  ].slice(0, 10);
}
function blockersFrom(features) {
  return [
    ...new Set(
      features.filter((f) => f.delta < 0 || HURT_CODES.has(f.code)).map((f) => f.code)
    )
  ].slice(0, 10);
}
function deriveStatus(s, thresholds, now = /* @__PURE__ */ new Date()) {
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
function scoreRepo(s, config, now = /* @__PURE__ */ new Date()) {
  const contributions = [
    ...qualityFeatures(s),
    ...aliveFeatures(s, config.thresholds, now),
    ...structureFeatures(s)
  ];
  const pillars = {
    quality: pillarFrom("quality", contributions),
    alive: pillarFrom("alive", contributions),
    structure: pillarFrom("structure", contributions)
  };
  const score = clamp(
    config.weights.quality * pillars.quality + config.weights.alive * pillars.alive + config.weights.structure * pillars.structure
  );
  const aliveFirst = [
    ...driversFrom(contributions.filter((c2) => c2.pillar === "alive")),
    ...driversFrom(contributions.filter((c2) => c2.pillar !== "alive"))
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
    contributions
  };
}
function scoreAll(signals, config, now = /* @__PURE__ */ new Date()) {
  return signals.map((s) => scoreRepo(s, config, now)).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.signals.fullName.localeCompare(b.signals.fullName);
  });
}

// src/run.ts
function assertNotAborted(signal) {
  if (signal?.aborted) throw new Error("aborted");
}
function loadPreviousReport(dataPath) {
  if (!existsSync6(dataPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync6(dataPath, "utf8"));
    if (parsed?.schema_version !== 1 || !Array.isArray(parsed.repos)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function writeProofArtifacts(cwd, report) {
  const dir = resolve6(cwd, "data/proofs");
  mkdirSync2(dir, { recursive: true });
  const index = [];
  for (const repo of report.repos) {
    const d = repo.signals.demo;
    if (!d.url && d.status === "NONE") continue;
    const safe = repo.signals.fullName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const artifact = {
      fullName: repo.signals.fullName,
      status: repo.status,
      score: repo.score,
      demo: d
    };
    writeFileSync2(
      join3(dir, `${safe}.json`),
      `${JSON.stringify(artifact, null, 2)}
`,
      "utf8"
    );
    index.push({
      fullName: repo.signals.fullName,
      verified: d.verified,
      bodyHash: d.bodyHash,
      finalUrl: d.finalUrl,
      probedAt: d.probedAt
    });
  }
  writeFileSync2(
    join3(dir, "latest.json"),
    `${JSON.stringify({ generated_at: report.generated_at, repos: index }, null, 2)}
`,
    "utf8"
  );
}
async function runRuro(options) {
  const cwd = resolve6(options.cwd ?? process.cwd());
  const dataPath = resolve6(cwd, options.config.render.data_path);
  const previous = loadPreviousReport(dataPath);
  const signal = options.signal;
  assertNotAborted(signal);
  const clients = createClients(options.token);
  const { included, excludedCount } = await collectRepoSignals(
    clients,
    options.config,
    signal
  );
  assertNotAborted(signal);
  const probes = await probeAll(
    included.map((r) => ({
      homepageUrl: r.homepageUrl,
      url: r.url,
      fullName: r.fullName
    })),
    options.config,
    6,
    signal
  );
  included.forEach((repo, i) => {
    repo.demo = probes[i];
  });
  assertNotAborted(signal);
  const scored = scoreAll(included, options.config);
  const draft = buildReport(options.config, scored, excludedCount, []);
  const transitions = computeTransitions(previous, draft);
  const regressions = computeRegressions(previous, draft);
  const report = { ...draft, transitions, regressions };
  const dashboardMarkdown = renderDashboard(report, options.config);
  const profileSnippet = renderProfileSnippet(report, options.config);
  const profileSvg = renderProfileSvg(report, options.config);
  const overviewMarkdown = renderOverview(report, options.config);
  let webHtml = renderWebDashboard(report, options.config);
  const dashboardPath = resolve6(cwd, options.config.render.dashboard_path);
  const profileSnippetPath = resolve6(
    cwd,
    options.config.render.profile_snippet_path
  );
  const profileSvgPath = resolve6(cwd, options.config.render.profile_svg_path);
  const overviewPath = resolve6(cwd, options.config.render.overview_path);
  const webPath = resolve6(cwd, options.config.render.web_path);
  let profileSynced = false;
  let aiAnnotated = 0;
  if (!options.dryRun) {
    mkdirSync2(dirname(dashboardPath), { recursive: true });
    mkdirSync2(dirname(dataPath), { recursive: true });
    mkdirSync2(dirname(profileSnippetPath), { recursive: true });
    mkdirSync2(dirname(profileSvgPath), { recursive: true });
    mkdirSync2(dirname(overviewPath), { recursive: true });
    mkdirSync2(dirname(webPath), { recursive: true });
    writeFileSync2(dashboardPath, dashboardMarkdown, "utf8");
    writeFileSync2(dataPath, `${JSON.stringify(report, null, 2)}
`, "utf8");
    writeFileSync2(profileSnippetPath, profileSnippet, "utf8");
    writeFileSync2(profileSvgPath, profileSvg, "utf8");
    writeFileSync2(overviewPath, overviewMarkdown, "utf8");
    writeFileSync2(webPath, webHtml, "utf8");
    writeProofArtifacts(cwd, report);
    if (options.config.render.history) {
      const day = report.generated_at.slice(0, 10);
      const historyPath = resolve6(
        cwd,
        join3(options.config.render.history_dir, `${day}.json`)
      );
      mkdirSync2(dirname(historyPath), { recursive: true });
      writeFileSync2(historyPath, `${JSON.stringify(report, null, 2)}
`, "utf8");
    }
    const shouldSync = options.syncProfile ?? options.config.profile.enabled;
    if (shouldSync && options.config.profile.enabled) {
      assertNotAborted(signal);
      const sync = await syncProfileReadme(
        options.token,
        options.config,
        profileSnippet
      );
      profileSynced = sync.updated;
    }
    if (options.config.ai.enabled && options.config.ai.provider === "copilot") {
      assertNotAborted(signal);
      const ai = await annotateWithCopilot({
        report,
        config: options.config,
        cwd,
        token: options.token,
        signal
      });
      aiAnnotated = ai.annotated;
      webHtml = renderWebDashboard(report, options.config);
      writeFileSync2(webPath, webHtml, "utf8");
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

// src/cli/repl.ts
function help() {
  printSlashMenu(SLASH_COMMANDS, "menu");
}
function completer(reportNames) {
  return (line) => {
    if (line.startsWith("/")) {
      const rest = line.slice(1);
      const space = rest.indexOf(" ");
      if (space < 0) {
        const hits3 = filterSlashCommands(rest).map((x) => `/${x.cmd}`);
        return [hits3.length ? hits3 : SLASH_COMMANDS.map((x) => `/${x.cmd}`), line];
      }
      const after = rest.slice(space + 1);
      const hits2 = reportNames.filter((n) => n.startsWith(after));
      const prefix = line.slice(0, line.length - after.length);
      return [hits2.map((n) => prefix + n), after];
    }
    const parts = line.split(/\s+/);
    const last = parts[parts.length - 1] ?? "";
    const cmds = SLASH_COMMANDS.map((x) => x.cmd);
    const pool = parts.length <= 1 ? [...cmds, ...reportNames] : [...reportNames];
    const hits = pool.filter((name) => name.startsWith(last));
    return [hits.length ? hits : pool, last];
  };
}
async function startRepl(opts) {
  const cwd = opts.cwd ?? process.cwd();
  const config = opts.config;
  let report = loadLatestReport(config, cwd);
  let abort = null;
  const repoNames = report.repos.map((r) => r.signals.name);
  printBoot({ owner: report.owner, repos: report.included_count });
  agent(`Online. Type / for the menu. Tab completes. Enter runs.`);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c("lime", "\u203A")} `,
    terminal: true,
    completer: completer(repoNames)
  });
  let slashMenuShownFor = "";
  let slashMenuLines = 0;
  let slashAlreadyVisible = false;
  const redrawSlashMenu = (partial) => {
    const filtered = filterSlashCommands(partial);
    const list = filtered.length ? filtered : SLASH_COMMANDS;
    const signature = `${partial}|${list.map((x) => x.cmd).join(",")}`;
    if (signature === slashMenuShownFor) return;
    slashMenuShownFor = signature;
    if (slashMenuLines > 0) eraseSlashMenu(slashMenuLines);
    slashMenuLines = printSlashMenu(list, partial || "menu");
    slashAlreadyVisible = true;
    rl.prompt(true);
  };
  const clearSlashUi = () => {
    if (slashMenuLines > 0) eraseSlashMenu(slashMenuLines);
    slashMenuLines = 0;
    slashMenuShownFor = "";
    slashAlreadyVisible = false;
  };
  readline.emitKeypressEvents(process.stdin, rl);
  const onKeypress = (_str, key) => {
    if (!key || key.ctrl || key.meta) return;
    if (key.name === "return" || key.name === "enter") return;
    if (key.name === "escape") {
      clearSlashUi();
      rl.prompt(true);
      return;
    }
    setImmediate(() => {
      const line = rl.line ?? "";
      if (!line.startsWith("/")) {
        clearSlashUi();
        return;
      }
      if (line.includes(" ", 1)) {
        clearSlashUi();
        return;
      }
      redrawSlashMenu(line.slice(1).toLowerCase());
    });
  };
  process.stdin.on("keypress", onKeypress);
  const reload = () => {
    report = loadLatestReport(config, cwd);
    repoNames.splice(
      0,
      repoNames.length,
      ...report.repos.map((r) => r.signals.name)
    );
    agent(
      `Reloaded \xB7 ${report.included_count} repos \xB7 ${report.generated_at.slice(0, 19)}`
    );
  };
  const onSigInt = () => {
    if (abort) {
      abort.abort();
      abort = null;
      agent("Cancelled.");
    }
  };
  process.on("SIGINT", onSigInt);
  const handle = async (line) => {
    if (line.trim() === "/" && slashAlreadyVisible) {
      clearSlashUi();
      agent("Pick a command (e.g. /brief) or keep typing to filter.");
      return "continue";
    }
    let input = line;
    const bare = line.trim().match(/^\/([a-z]+)$/i);
    if (bare) {
      const hit = resolveSlashPrefix(bare[1]);
      if (hit) input = `/${hit.cmd}`;
    }
    clearSlashUi();
    const intent = parseIntent(input);
    try {
      switch (intent.kind) {
        case "empty":
          return "continue";
        case "menu": {
          const filtered = filterSlashCommands(intent.arg ?? "");
          const list = filtered.length ? filtered : SLASH_COMMANDS;
          printSlashMenu(list, intent.arg || "menu");
          return "continue";
        }
        case "exit":
          agent("Offline.");
          return "exit";
        case "help":
          help();
          return "continue";
        case "clear":
          console.clear();
          printBoot({ owner: report.owner, repos: report.included_count });
          return "continue";
        case "reload":
          reload();
          return "continue";
        case "view":
          narrateView(report);
          return "continue";
        case "brief":
          narrateBrief(report, config, cwd);
          return "continue";
        case "next":
          narrateNext(report);
          return "continue";
        case "diff":
          narrateDiff(report, config, cwd);
          return "continue";
        case "top":
          narrateTop(report, intent.n ?? 5);
          return "continue";
        case "status":
          if (!intent.arg) {
            agent("Which repo? e.g. /status aryanbloodbank");
            return "continue";
          }
          narrateStatus(report, intent.arg);
          return "continue";
        case "full":
          if (!intent.arg) {
            agent("Which repo? e.g. /full aryanbloodbank");
            return "continue";
          }
          narrateFull(report, intent.arg);
          return "continue";
        case "why":
          if (!intent.arg) {
            agent("Which repo? e.g. /why phantom");
            return "continue";
          }
          narrateWhy(report, config, intent.arg);
          return "continue";
        case "review": {
          const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || void 0;
          if (!token) {
            agent("Set GITHUB_TOKEN (or GH_TOKEN) in this shell, then retry.");
            return "continue";
          }
          if (!intent.arg) {
            agent("Which repo? e.g. /review aryanbloodbank");
            return "continue";
          }
          const target = findIn(report, intent.arg);
          const prog = startProgress(`auditing ${target.signals.name}`);
          abort = new AbortController();
          try {
            const aiConfig = {
              ...config,
              ai: {
                ...config.ai,
                enabled: true,
                provider: "copilot",
                top_n: 1
              }
            };
            const result = await annotateWithCopilot({
              report: { ...report, repos: [target] },
              config: aiConfig,
              cwd,
              token,
              signal: abort.signal
            });
            if (abort.signal.aborted) {
              prog.fail("cancelled");
              return "continue";
            }
            prog.done(result.skipped ? "audit skipped" : "audit stored");
            if (result.skipped) {
              agent(`Audit skipped \u2014 ${result.reason ?? "unknown"}`);
            }
            narrateReview(readAiCache(cwd, config.ai.cache_dir), intent.arg);
          } catch (err) {
            prog.fail("audit failed");
            throw err;
          } finally {
            abort = null;
          }
          return "continue";
        }
        case "scan": {
          const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || void 0;
          if (!token) {
            agent("Set GITHUB_TOKEN (or GH_TOKEN) to scan.");
            return "continue";
          }
          const prog = startProgress("scanning GitHub + probes + fitness");
          abort = new AbortController();
          try {
            const result = await runRuro({
              token,
              config,
              cwd,
              signal: abort.signal
            });
            if (abort.signal.aborted) {
              prog.fail("cancelled");
              return "continue";
            }
            prog.done(
              `scored ${result.report.included_count} \xB7 lead ${result.report.repos[0]?.signals.name ?? "\u2014"}`
            );
            agent(
              `Done \xB7 ${result.report.included_count} scored \xB7 lead ${result.report.repos[0]?.signals.name ?? "\u2014"}`
            );
            reload();
          } catch (err) {
            if (abort?.signal.aborted || err instanceof Error && err.message === "aborted") {
              prog.fail("cancelled");
              return "continue";
            }
            prog.fail("scan failed");
            throw err;
          } finally {
            abort = null;
          }
          return "continue";
        }
        default:
          agent(`Unknown. Type / for the command menu.`);
          return "continue";
      }
    } catch (err) {
      agent(err instanceof Error ? err.message : String(err));
      return "continue";
    }
  };
  rl.prompt();
  for await (const line of rl) {
    const next = await handle(line);
    if (next === "exit") {
      process.stdin.off("keypress", onKeypress);
      process.off("SIGINT", onSigInt);
      rl.close();
      break;
    }
    rl.prompt();
  }
}

// src/cli.ts
function usage(code = 1) {
  printBanner("help");
  console.log(`
  ruro                         live agent session (Ruri)
  ruro repl|live|shell         same
  ruro scan                    refresh truth (needs token)
  ruro brief | next | diff     operator surfaces
  ruro view | top [n]          fleet / shortlist
  ruro status <repo>           dossier + deploy proof
  ruro full <repo>             long dossier
  ruro why <repo>              contributions + playbook
  ruro review [repo]           Copilot garnish (optional)
  ruro help                    this help
  ruro --json <cmd> \u2026          machine output

Live:
  $ npm run ruro
  \u203A brief
  \u203A why phantom
  \u203A /exit

Env: GITHUB_TOKEN or GH_TOKEN for scan & review
`);
  process.exit(code);
}
function takeFlag(args, flag) {
  const i = args.indexOf(flag);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}
function parseConfigPath(args) {
  let configPath = "ruro.yml";
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--config") configPath = args[++i];
    else rest.push(args[i]);
  }
  return { configPath, rest };
}
function loadCfg(configPath, owner) {
  try {
    return loadConfig(configPath, owner);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const missing = /Config not found:/i.test(msg);
    if (missing && owner) {
      return defaultConfig(owner);
    }
    if (missing) {
      console.error(`Config missing at ${configPath}; pass --owner.`);
      process.exit(1);
    }
    console.error(msg);
    process.exit(1);
  }
}
function emitJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}
`);
}
function whyPayload(repo, config) {
  return {
    fullName: repo.signals.fullName,
    score: repo.score,
    status: repo.status,
    pillars: repo.pillars,
    weights: config.weights,
    formula: explainScoreLine(repo.score, repo.pillars, config.weights),
    contributions: repo.contributions ?? [],
    drivers: repo.drivers.map((d) => ({ code: d, explain: explainCode(d) })),
    blockers: repo.blockers.map((b) => ({ code: b, explain: explainCode(b) }))
  };
}
async function runScan(args, asJson) {
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
    else if (a === "--json") continue;
    else {
      console.error(`Unknown arg: ${a}`);
      usage();
    }
  }
  if (!token) {
    console.error("Missing token. Set GITHUB_TOKEN or pass --token.");
    process.exit(1);
  }
  if (!asJson) {
    printBanner("scan");
    tool("scanning GitHub + probes + fitness\u2026");
  }
  const config = loadCfg(configPath, owner);
  const result = await runRuro({ token, config, dryRun, syncProfile });
  if (asJson) {
    emitJson({
      ok: true,
      included: result.report.included_count,
      lead: result.report.repos[0]?.signals.fullName ?? null,
      dashboardPath: result.dashboardPath,
      webPath: result.webPath,
      generated_at: result.report.generated_at
    });
    return;
  }
  agent(
    `Done \xB7 ${result.report.included_count} scored \xB7 lead ${result.report.repos[0]?.signals.name ?? "\u2014"}`
  );
}
async function runReview(args, asJson) {
  let configPath = "ruro.yml";
  let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || void 0;
  let query;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--config") configPath = args[++i];
    else if (a === "--token") token = args[++i];
    else if (a === "--force" || a === "--json") continue;
    else if (a.startsWith("-")) {
      console.error(`Unknown arg: ${a}`);
      usage();
    } else query = a;
  }
  if (!token) {
    console.error("Missing token. Set GITHUB_TOKEN or pass --token.");
    process.exit(1);
  }
  const config = loadCfg(configPath);
  const report = loadLatestReport(config);
  const aiConfig = {
    ...config,
    ai: {
      ...config.ai,
      enabled: true,
      provider: "copilot",
      top_n: query ? 1 : config.ai.top_n
    }
  };
  const scoped = query ? { ...report, repos: [findRepo(report, query)] } : { ...report, repos: report.repos.slice(0, config.ai.top_n) };
  if (!asJson) {
    printBanner(`review ${query ?? "top"}`);
    tool(`auditing ${query ?? "top"} with Copilot\u2026`);
  }
  const result = await annotateWithCopilot({
    report: scoped,
    config: aiConfig,
    cwd: process.cwd(),
    token
  });
  const cache = readAiCache(process.cwd(), config.ai.cache_dir);
  if (asJson) {
    emitJson({
      ok: !result.skipped,
      skipped: result.skipped,
      reason: result.reason,
      annotated: result.annotated,
      cache
    });
    return;
  }
  if (result.skipped) {
    agent(`Audit skipped \u2014 ${result.reason ?? "unknown"}`);
  } else {
    agent(`Audit stored (${result.annotated}).`);
  }
  narrateReview(cache, query);
}
async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help") || argv[0] === "help") {
    usage(0);
  }
  const asJson = takeFlag(argv, "--json");
  if (argv.length === 0 || argv[0] === "repl" || argv[0] === "shell" || argv[0] === "live") {
    if (asJson) {
      console.error("--json cannot start an interactive session");
      process.exit(1);
    }
    let configPath2 = "ruro.yml";
    const rest2 = argv[0] && ["repl", "shell", "live"].includes(argv[0]) ? argv.slice(1) : argv;
    for (let i = 0; i < rest2.length; i += 1) {
      if (rest2[i] === "--config") configPath2 = rest2[++i];
    }
    const config2 = loadCfg(configPath2);
    await startRepl({ config: config2 });
    return;
  }
  const cmd = argv[0];
  const isSub = [
    "scan",
    "view",
    "top",
    "status",
    "full",
    "why",
    "review",
    "explain",
    "brief",
    "next",
    "diff"
  ].includes(cmd);
  if (!isSub) {
    console.error(`Unknown command: ${cmd}`);
    usage(1);
  }
  const subArgs = argv.slice(1);
  if (cmd === "scan") {
    await runScan(subArgs, asJson);
    return;
  }
  if (cmd === "review") {
    await runReview(subArgs, asJson);
    return;
  }
  const { configPath, rest } = parseConfigPath(subArgs);
  const config = loadCfg(configPath);
  const report = loadLatestReport(config);
  if (cmd === "view") {
    if (asJson) {
      emitJson(summarizeReport(report));
      return;
    }
    narrateView(report);
    return;
  }
  if (cmd === "brief") {
    if (asJson) {
      emitJson({
        owner: report.owner,
        regressions: report.regressions ?? [],
        top: report.repos.slice(0, 5).map(summarizeRepo)
      });
      return;
    }
    narrateBrief(report, config);
    return;
  }
  if (cmd === "next") {
    if (asJson) {
      emitJson({
        actions: report.repos.flatMap(
          (r) => r.blockers.slice(0, 2).map((b) => ({
            repo: r.signals.name,
            blocker: b
          }))
        ).slice(0, 10)
      });
      return;
    }
    narrateNext(report);
    return;
  }
  if (cmd === "diff") {
    if (asJson) {
      emitJson({
        transitions: report.transitions,
        regressions: report.regressions ?? []
      });
      return;
    }
    narrateDiff(report, config);
    return;
  }
  if (cmd === "top") {
    const n = rest[0] ? Number.parseInt(rest[0], 10) : 5;
    if (!Number.isFinite(n) || n < 1) {
      console.error("top expects a positive integer");
      process.exit(1);
    }
    if (asJson) {
      emitJson({
        owner: report.owner,
        top: report.repos.slice(0, n).map(summarizeRepo)
      });
      return;
    }
    narrateTop(report, n);
    return;
  }
  if (cmd === "status" || cmd === "full") {
    const query = rest[0];
    if (!query) {
      console.error(`${cmd} expects a repo name`);
      process.exit(1);
    }
    if (asJson) {
      emitJson(summarizeRepo(findRepo(report, query)));
      return;
    }
    if (cmd === "full") {
      narrateFull(report, query);
      return;
    }
    narrateStatus(report, query);
    return;
  }
  if (cmd === "why" || cmd === "explain") {
    const query = rest[0];
    if (!query) {
      console.error("why expects a repo name");
      process.exit(1);
    }
    const repo = findRepo(report, query);
    if (asJson) {
      emitJson(whyPayload(repo, config));
      return;
    }
    narrateWhy(report, config, query);
  }
}
function summarizeRepo(repo) {
  return {
    fullName: repo.signals.fullName,
    name: repo.signals.name,
    status: repo.status,
    score: repo.score,
    pillars: repo.pillars,
    deploy: {
      status: repo.signals.demo.status,
      verified: repo.signals.demo.verified,
      url: repo.signals.demo.url,
      bodyHash: repo.signals.demo.bodyHash ?? null,
      spaShell: repo.signals.demo.spaShell ?? false,
      hashStable: repo.signals.demo.hashStable ?? null
    },
    fitness: repo.signals.fitness.score,
    ciConclusions: repo.signals.ciConclusions ?? [],
    ownerCommitShare: repo.signals.ownerCommitShare ?? null,
    drivers: repo.drivers,
    blockers: repo.blockers,
    contributions: repo.contributions ?? []
  };
}
function summarizeReport(report) {
  return {
    owner: report.owner,
    generated_at: report.generated_at,
    included_count: report.included_count,
    excluded_count: report.excluded_count,
    status_counts: report.status_counts,
    verified: report.repos.filter((r) => r.signals.demo.verified).length,
    repos: report.repos.map(summarizeRepo)
  };
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
