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
    title: z.string().default("Ruro Portfolio Scorecard"),
    profile_snippet_path: z.string().default("PROFILE_SNIPPET.md"),
    profile_svg_path: z.string().default("assets/ruro-card.svg"),
    profile_top_n: z.number().int().positive().default(5),
    web_path: z.string().default("docs/index.html"),
    overview_path: z.string().default("OVERVIEW.md")
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

// src/run.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync2, readFileSync as readFileSync4, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname, join as join2, resolve as resolve4 } from "node:path";

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
  const { report, config, cwd, token } = opts;
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
    const cloneUrl = `https://x-access-token:${token}@github.com/${fullName}.git`;
    const clone = spawnSync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--single-branch",
        cloneUrl,
        join(work, "repo")
      ],
      { encoding: "utf8", timeout: 12e4 }
    );
    if (clone.status !== 0) {
      throw new Error(
        (clone.stderr || clone.stdout || "git clone failed").slice(0, 400)
      );
    }
    const repoDir = join(work, "repo");
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
      error: err instanceof Error ? err.message : String(err),
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
function emptyPayload(status, note) {
  return {
    schema_version: AI_CACHE_SCHEMA,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: "copilot",
    status,
    note,
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
      collected.push(mapRepo(node, now, config.owner));
    }
    hasNext = conn.pageInfo.hasNextPage;
    cursor = conn.pageInfo.endCursor;
  }
  const { enrichCodeFitness: enrichCodeFitness2 } = await Promise.resolve().then(() => (init_code(), code_exports));
  await enrichCodeFitness2(clients, collected);
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

// src/history/regressions.ts
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.probes.timeout_ms);
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
async function probeAll(repos, config, concurrency = 6) {
  const results = new Array(repos.length);
  let index = 0;
  async function worker() {
    while (index < repos.length) {
      const current = index;
      index += 1;
      const repo = repos[current];
      results[current] = await probeDemoUrl(repo.homepageUrl, config, {
        repoHtmlUrl: repo.url,
        fullName: repo.fullName
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
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
import { resolve as resolve3 } from "node:path";
function esc2(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function loadAiReviews(config, cwd = process.cwd()) {
  const path = resolve3(cwd, config.ai.cache_dir, "latest.json");
  if (!existsSync3(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync3(path, "utf8"));
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
      <span>Pages from /docs \xB7 CLI: <code>ruro view</code> \xB7 <code>ruro review</code></span>
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
    const ok = s.ciConclusions.filter((c) => c === "success").length;
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
    ...driversFrom(contributions.filter((c) => c.pillar === "alive")),
    ...driversFrom(contributions.filter((c) => c.pillar !== "alive"))
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
function writeProofArtifacts(cwd, report) {
  const dir = resolve4(cwd, "data/proofs");
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
      join2(dir, `${safe}.json`),
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
    join2(dir, "latest.json"),
    `${JSON.stringify({ generated_at: report.generated_at, repos: index }, null, 2)}
`,
    "utf8"
  );
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
    included.map((r) => ({
      homepageUrl: r.homepageUrl,
      url: r.url,
      fullName: r.fullName
    })),
    options.config
  );
  included.forEach((repo, i) => {
    repo.demo = probes[i];
  });
  const scored = scoreAll(included, options.config);
  const draft = buildReport(options.config, scored, excludedCount, []);
  const transitions = computeTransitions(previous, draft);
  const regressions = computeRegressions(previous, draft);
  const report = { ...draft, transitions, regressions };
  const dashboardMarkdown = renderDashboard(report, options.config);
  const profileSnippet = renderProfileSnippet(report, options.config);
  const profileSvg = renderProfileSvg(report, options.config);
  const overviewMarkdown = renderOverview(report, options.config);
  const webHtml = renderWebDashboard(report, options.config);
  const dashboardPath = resolve4(cwd, options.config.render.dashboard_path);
  const profileSnippetPath = resolve4(
    cwd,
    options.config.render.profile_snippet_path
  );
  const profileSvgPath = resolve4(cwd, options.config.render.profile_svg_path);
  const overviewPath = resolve4(cwd, options.config.render.overview_path);
  const webPath = resolve4(cwd, options.config.render.web_path);
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
        cwd,
        token: options.token
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

// src/index.ts
async function main() {
  const token = core.getInput("token", { required: true });
  const configPath = core.getInput("config-path") || "ruro.yml";
  const ownerInput = core.getInput("owner") || void 0;
  const dryRun = core.getBooleanInput("dry-run");
  const syncProfileInput = core.getInput("sync-profile");
  const syncProfile = syncProfileInput === "" ? void 0 : syncProfileInput === "true";
  let config = loadConfig(configPath, ownerInput);
  if (!config.owner) {
    config = {
      ...config,
      owner: github.context.repo.owner
    };
  }
  core.info(
    `Ruro scanning owner=${config.owner} dryRun=${dryRun} syncProfile=${syncProfile ?? config.profile.enabled}`
  );
  const result = await runRuro({ token, config, dryRun, syncProfile });
  core.setOutput("repo-count", String(result.report.included_count));
  core.setOutput("dashboard-path", result.dashboardPath);
  core.setOutput("web-path", result.webPath);
  core.setOutput("profile-synced", String(result.profileSynced));
  core.info(
    `Scored ${result.report.included_count} repos \u2192 ${result.dashboardPath}`
  );
  core.info(`Web dashboard \u2192 ${result.webPath}`);
  if (result.profileSynced) {
    core.info(`Profile README synced for ${config.profile.repo}`);
  }
  if (result.aiAnnotated > 0) {
    core.info(`AI annotations written for ${result.aiAnnotated} repos`);
  }
}
main().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
