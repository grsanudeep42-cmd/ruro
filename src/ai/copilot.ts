import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { RuroConfig } from "../config.js";
import type { RuroReport, ScoredRepo } from "../types.js";

export interface RepoReview {
  fullName: string;
  status: "ok" | "skipped" | "error";
  score: number;
  repoStatus: string;
  why_showable: string;
  strengths: string[];
  weaknesses: string[];
  review: string;
  error?: string;
}

export const AI_CACHE_SCHEMA = 1 as const;

export interface AiCachePayload {
  schema_version: typeof AI_CACHE_SCHEMA;
  generated_at: string;
  provider: string;
  status: string;
  note?: string;
  repos: RepoReview[];
}

export interface AnnotateResult {
  annotated: number;
  skipped: boolean;
  reason?: string;
  reviews: RepoReview[];
}

/**
 * Copilot audit — dossier is embedded in the prompt so the model does not
 * depend on sandbox file tools (that was the "permission / cannot read" failure).
 */
export async function annotateWithCopilot(opts: {
  report: RuroReport;
  config: RuroConfig;
  cwd: string;
  token?: string;
  signal?: AbortSignal;
}): Promise<AnnotateResult> {
  const { report, config, cwd, token, signal } = opts;
  if (signal?.aborted) throw new Error("aborted");
  if (!config.ai.enabled || config.ai.provider !== "copilot") {
    return { annotated: 0, skipped: true, reason: "ai disabled", reviews: [] };
  }

  const cacheDir = resolve(cwd, config.ai.cache_dir);
  mkdirSync(cacheDir, { recursive: true });

  if (!(await commandExists("copilot"))) {
    const stub = emptyPayload(
      "unavailable",
      "Copilot CLI not on PATH. Install @github/copilot and authenticate. Scores unchanged.",
    );
    writeJson(join(cacheDir, "latest.json"), stub);
    return {
      annotated: 0,
      skipped: true,
      reason: "copilot cli missing",
      reviews: [],
    };
  }

  const top = report.repos.slice(0, config.ai.top_n);
  const reviews: RepoReview[] = [];

  for (const repo of top) {
    if (signal?.aborted) throw new Error("aborted");
    const reviewed = await reviewOneRepo({
      repo,
      config,
      token: token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
      cacheDir,
    });
    reviews.push(reviewed);
  }

  const ok = reviews.filter((r) => r.status === "ok");
  const payload: AiCachePayload = {
    schema_version: AI_CACHE_SCHEMA,
    generated_at: new Date().toISOString(),
    provider: "copilot",
    status: ok.length ? "reviewed" : "partial",
    note: "Judgment only — never moves scores. Embedded dossier; cite real paths.",
    repos: reviews,
  };
  writeJson(join(cacheDir, "latest.json"), payload);

  return {
    annotated: ok.length,
    skipped: ok.length === 0,
    reason: ok.length ? undefined : "all reviews failed or skipped",
    reviews,
  };
}

async function reviewOneRepo(opts: {
  repo: ScoredRepo;
  config: RuroConfig;
  token?: string;
  cacheDir: string;
}): Promise<RepoReview> {
  const { repo, config, token, cacheDir } = opts;
  const fullName = repo.signals.fullName;
  const safe = fullName.replace(/[^\w.-]+/g, "_");
  const base: RepoReview = {
    fullName,
    status: "skipped",
    score: repo.score,
    repoStatus: repo.status,
    why_showable: "",
    strengths: repo.drivers.slice(0, 5),
    weaknesses: repo.blockers.slice(0, 5),
    review: "",
  };

  if (!token) {
    return {
      ...base,
      status: "error",
      error: "missing token for clone",
      why_showable: signalWhy(repo),
      review: signalFallbackReview(repo),
    };
  }

  let work: string | null = null;
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
        "",
      ].join("\n"),
      { mode: 0o700 },
    );
    // Token via GIT_ASKPASS env — never embed PAT in argv or remote URL
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
        repoDir,
      ],
      {
        encoding: "utf8",
        timeout: 120_000,
        env: {
          ...process.env,
          GIT_ASKPASS: askpass,
          GIT_TERMINAL_PROMPT: "0",
          RURO_GIT_ASKPASS_TOKEN: token,
        },
      },
    );
    if (clone.status !== 0) {
      throw new Error(
        redactSecrets(
          (clone.stderr || clone.stdout || "git clone failed").slice(0, 400),
          token,
        ),
      );
    }
    const dossier = buildRepoDossier(repoDir, repo);
    writeFileSync(join(repoDir, "RURO_DOSSIER.md"), dossier, "utf8");

    // Embed dossier in the prompt — Copilot sandbox often cannot read tmp clones.
    const embedded = dossier.slice(0, 28_000);
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
      "===== END DOSSIER =====",
    ].join("\n");

    const env = {
      ...process.env,
      COPILOT_GITHUB_TOKEN: token,
      GITHUB_TOKEN: token,
      GH_TOKEN: token,
    };

    // Prefer prompt-only mode (no tools) — dossier is already in context.
    const result = spawnSync(
      "copilot",
      ["-p", prompt, "-s", "--no-ask-user"],
      {
        cwd: repoDir,
        encoding: "utf8",
        timeout: config.ai.timeout_ms,
        env,
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    const text = (result.stdout || "").trim() || (result.stderr || "").trim();
    if (!text) {
      throw new Error(
        `copilot exited ${result.status ?? "null"} with no output`,
      );
    }
    if (/REVIEW_FAILED:\s*cannot read source/i.test(text)) {
      throw new Error(
        "copilot still refused to use the embedded dossier — check Copilot auth/credits",
      );
    }

    const hits = citationHits(text, dossier);
    if (hits.length < 2) {
      throw new Error(
        `audit rejected: need ≥2 dossier path citations (got ${hits.length}: ${hits.join(", ") || "none"}). Head: ${text.slice(0, 280)}`,
      );
    }

    const parsed = parseReviewMarkdown(text, repo);
    const out: RepoReview = {
      ...base,
      status: "ok",
      why_showable: parsed.why_showable,
      strengths: parsed.strengths.length ? parsed.strengths : base.strengths,
      weaknesses: parsed.weaknesses.length ? parsed.weaknesses : base.weaknesses,
      review: `${parsed.review || text}\n\n_Cited:_ ${hits.slice(0, 12).join(", ")}`,
    };

    writeFileSync(join(cacheDir, `${safe}.md`), formatReviewMd(out), "utf8");
    writeJson(join(cacheDir, `${safe}.json`), out);
    return out;
  } catch (err) {
    const fallback: RepoReview = {
      ...base,
      status: "error",
      error: redactSecrets(
        err instanceof Error ? err.message : String(err),
        token ?? "",
      ),
      why_showable: signalWhy(repo),
      review: signalFallbackReview(repo),
    };
    writeFileSync(
      join(cacheDir, `${safe}.md`),
      formatReviewMd(fallback),
      "utf8",
    );
    writeJson(join(cacheDir, `${safe}.json`), fallback);
    return fallback;
  } finally {
    if (work) {
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

function redactSecrets(text: string, token: string): string {
  let out = text;
  if (token) {
    out = out.split(token).join("[redacted]");
  }
  return out
    .replace(/x-access-token:[^\s@/'"]+/gi, "x-access-token:[redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "bearer [redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9_]{10,}/g, "[redacted-token]");
}

function collectSourceFiles(root: string, limit = 10): string[] {
  const out: string[] = [];
  const stack = [root];
  const skip = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
    "vendor",
    "target",
  ]);
  while (stack.length && out.length < limit) {
    const dir = stack.pop()!;
    let entries: string[] = [];
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
      if (
        /\.(ts|tsx|js|jsx|py|go|rs|swift)$/i.test(name) &&
        !/\.(test|spec)\./i.test(name)
      ) {
        out.push(abs);
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

function buildRepoDossier(repoDir: string, repo: ScoredRepo): string {
  const lines: string[] = [
    `# Ruro dossier for ${repo.signals.fullName}`,
    "",
    `Status ${repo.status} · score ${repo.score}`,
    `Demo ${repo.signals.demo.status}${repo.signals.demo.verified ? " verified" : ""} url=${repo.signals.demo.url ?? "—"}`,
    `Fitness ${repo.signals.fitness.score} (${repo.signals.fitness.sourceFiles} src / ${repo.signals.fitness.testFiles} tests)`,
    `Drivers: ${repo.drivers.join(", ")}`,
    `Blockers: ${repo.blockers.join(", ")}`,
    "",
    "## Tree (truncated)",
  ];

  const tree = spawnSync(
    "bash",
    [
      "-lc",
      "find . -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.py' -o -name '*.go' -o -name '*.rs' -o -name '*.md' -o -name 'package.json' -o -name 'pyproject.toml' -o -name 'Cargo.toml' -o -name 'go.mod' \\) ! -path './.git/*' ! -path './node_modules/*' ! -path './dist/*' ! -path './.next/*' | head -n 160",
    ],
    { cwd: repoDir, encoding: "utf8", timeout: 15_000 },
  );
  lines.push((tree.stdout || "").trim() || "(no files listed)");
  lines.push("", "## Key file previews");

  const candidates = [
    "README.md",
    "readme.md",
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
  ];
  for (const rel of candidates) {
    const abs = join(repoDir, rel);
    if (!existsSync(abs)) continue;
    try {
      const raw = readFileSync(abs, "utf8").slice(0, 2200);
      lines.push("", `### ${rel}`, "```", raw, "```");
    } catch {
      /* skip */
    }
  }

  for (const abs of collectSourceFiles(repoDir, 8)) {
    const rel = relative(repoDir, abs);
    try {
      const raw = readFileSync(abs, "utf8").slice(0, 1600);
      lines.push("", `### ${rel}`, "```", raw, "```");
    } catch {
      /* skip */
    }
  }
  return `${lines.join("\n")}\n`;
}

export function extractCitedPaths(text: string): string[] {
  const found = new Set<string>();
  const re =
    /(?:^|[\s`"'(])((?:\.\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:tsx|jsx|mjs|cjs|json|toml|yaml|yml|swift|java|sql|css|ts|js|py|go|rs|md|kt))(?=[\s`"'),.:;!?]|$)/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found.add(m[1].replace(/^\.\//, ""));
  }
  const bare =
    /\b(README\.md|package\.json|pyproject\.toml|Cargo\.toml|go\.mod|Dockerfile)\b/gi;
  while ((m = bare.exec(text)) !== null) found.add(m[1]);
  return [...found];
}

export function listKnownPaths(dossier: string): string[] {
  const paths: string[] = [];
  for (const line of dossier.split("\n")) {
    const t = line.trim();
    if (
      t.startsWith("./") ||
      /^[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|md|json|toml)$/.test(t)
    ) {
      paths.push(t.replace(/^\.\//, ""));
    }
    if (t.startsWith("### ")) paths.push(t.slice(4).trim());
  }
  return paths;
}

export function citationHits(text: string, dossier: string): string[] {
  const cited = extractCitedPaths(text);
  const known = listKnownPaths(dossier);
  return cited.filter((p) =>
    known.some((k) => k.endsWith(p) || k.includes(`/${p}`) || k === p),
  );
}

function parseReviewMarkdown(
  text: string,
  repo: ScoredRepo,
): Pick<RepoReview, "why_showable" | "strengths" | "weaknesses" | "review"> {
  const why =
    section(text, "Why showable") ||
    section(text, "Why Showable") ||
    signalWhy(repo);
  const strengths = bullets(section(text, "Strengths"));
  const weaknesses = bullets(section(text, "Weaknesses"));
  const review =
    section(text, "Code review") || section(text, "Code Review") || text;
  return { why_showable: why, strengths, weaknesses, review };
}

function section(text: string, title: string): string {
  const re = new RegExp(
    `##\\s*${title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    "i",
  );
  const m = text.match(re);
  return m?.[1]?.trim() ?? "";
}

function bullets(block: string): string[] {
  if (!block) return [];
  return block
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, 8);
}

function signalWhy(repo: ScoredRepo): string {
  return `${repo.signals.name} ranks ${repo.status} at score ${repo.score}. Drivers: ${repo.drivers.slice(0, 4).join(", ") || "—"}.`;
}

function signalFallbackReview(repo: ScoredRepo): string {
  return [
    `Signal-only fallback (Copilot review unavailable).`,
    `Blockers: ${repo.blockers.slice(0, 5).join(", ") || "—"}.`,
    `Demo: ${repo.signals.demo.status}${repo.signals.demo.verified ? " verified" : ""}.`,
  ].join(" ");
}

function formatReviewMd(r: RepoReview): string {
  return [
    `# ${r.fullName}`,
    "",
    `Status: ${r.repoStatus} · Score: ${r.score} · Review: ${r.status}`,
    "",
    "## Why showable",
    r.why_showable || "—",
    "",
    "## Strengths",
    ...(r.strengths.map((s) => `- ${s}`) || ["- —"]),
    "",
    "## Weaknesses",
    ...(r.weaknesses.map((s) => `- ${s}`) || ["- —"]),
    "",
    "## Code review",
    r.review || "—",
    r.error ? `\n\n_Error:_ ${r.error}` : "",
    "",
  ].join("\n");
}

function emptyPayload(status: string, note: string): AiCachePayload {
  return {
    schema_version: AI_CACHE_SCHEMA,
    generated_at: new Date().toISOString(),
    provider: "copilot",
    status,
    note,
    repos: [] as RepoReview[],
  };
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function commandExists(bin: string): Promise<boolean> {
  try {
    const result = spawnSync(bin, ["--help"], {
      stdio: "ignore",
      timeout: 3000,
    });
    return result.status === 0 || result.status === 1;
  } catch {
    return false;
  }
}

export function readAiCache(
  cwd: string,
  cacheDir: string,
): AiCachePayload | null {
  const path = resolve(cwd, cacheDir, "latest.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as AiCachePayload;
    if (!Array.isArray(parsed.repos)) return null;
    return parsed;
  } catch {
    return null;
  }
}
