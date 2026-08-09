import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

export interface AnnotateResult {
  annotated: number;
  skipped: boolean;
  reason?: string;
  reviews: RepoReview[];
}

/**
 * Optional Copilot layer — never required for scoring.
 * When enabled, shallow-clones top repos and runs Copilot CLI `/review`.
 */
export async function annotateWithCopilot(opts: {
  report: RuroReport;
  config: RuroConfig;
  cwd: string;
  token?: string;
}): Promise<AnnotateResult> {
  const { report, config, cwd, token } = opts;
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
    const reviewed = await reviewOneRepo({
      repo,
      config,
      token: token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
      cacheDir,
    });
    reviews.push(reviewed);
  }

  const ok = reviews.filter((r) => r.status === "ok");
  const payload = {
    generated_at: new Date().toISOString(),
    provider: "copilot",
    status: ok.length ? "reviewed" : "partial",
    note: "Scores stay signal-based. Copilot only annotates showability + code review.",
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
    const cloneUrl = `https://x-access-token:${token}@github.com/${fullName}.git`;
    const clone = spawnSync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--single-branch",
        cloneUrl,
        join(work, "repo"),
      ],
      { encoding: "utf8", timeout: 120_000 },
    );
    if (clone.status !== 0) {
      throw new Error(
        (clone.stderr || clone.stdout || "git clone failed").slice(0, 400),
      );
    }

    const repoDir = join(work, "repo");
    const dossier = buildRepoDossier(repoDir, repo);
    writeFileSync(join(repoDir, "RURO_DOSSIER.md"), dossier, "utf8");

    const prompt = [
      "You MUST read RURO_DOSSIER.md first, then open at least three real source files from this working tree.",
      "Do not invent files. In ## Code review cite concrete paths like src/app.ts or package.json.",
      "If you cannot read files, reply only: REVIEW_FAILED: cannot read source",
      "Judge whether this is a real functional product vs thin glue.",
      "Use signals in the dossier (demo verified?, fitness, blockers) but verify against code.",
      "Reply in markdown with exactly these sections:",
      "## Why showable",
      "## Strengths",
      "## Weaknesses",
      "## Code review",
      "Be blunt. Keep under 450 words.",
    ].join(" ");

    const env = {
      ...process.env,
      COPILOT_GITHUB_TOKEN: token,
      GITHUB_TOKEN: token,
      GH_TOKEN: token,
    };

    const result = spawnSync(
      "copilot",
      [
        "-p",
        prompt,
        "-s",
        "--no-ask-user",
        "--allow-all-tools",
      ],
      {
        cwd: repoDir,
        encoding: "utf8",
        timeout: config.ai.timeout_ms,
        env,
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    const text = (result.stdout || "").trim() || (result.stderr || "").trim();
    if (
      !text ||
      /REVIEW_FAILED|couldn't read the repo|permission errors/i.test(text)
    ) {
      throw new Error(
        text.slice(0, 500) ||
          `copilot exited ${result.status ?? "null"} without a readable review`,
      );
    }
    if (result.status !== 0 && text.length < 80) {
      throw new Error(
        text.slice(0, 400) ||
          `copilot exited ${result.status ?? "null"} with no output`,
      );
    }

    const cited = extractCitedPaths(text);
    const known = listKnownPaths(dossier);
    const hits = cited.filter((p) =>
      known.some((k) => k.endsWith(p) || k.includes(`/${p}`) || k === p),
    );
    if (hits.length < 2) {
      throw new Error(
        `audit rejected: need ≥2 real file citations from the clone (got ${hits.length}: ${hits.join(", ") || "none"}). Raw head: ${text.slice(0, 240)}`,
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
      error: err instanceof Error ? err.message : String(err),
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

function extractCitedPaths(text: string): string[] {
  const found = new Set<string>();
  const re =
    /(?:^|[\s`"'(])((?:\.\/)?(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|md|json|toml|yml|yaml|css|swift|kt|java|sql))(?=[\s`"''),]|$)/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found.add(m[1].replace(/^\.\//, ""));
  }
  // also bare filenames from dossier previews
  const bare =
    /\b(README\.md|package\.json|pyproject\.toml|Cargo\.toml|go\.mod|Dockerfile)\b/gi;
  while ((m = bare.exec(text)) !== null) found.add(m[1]);
  return [...found];
}

function listKnownPaths(dossier: string): string[] {
  const paths: string[] = [];
  for (const line of dossier.split("\n")) {
    const t = line.trim();
    if (t.startsWith("./") || /^[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|md|json|toml)$/.test(t)) {
      paths.push(t.replace(/^\.\//, ""));
    }
    if (t.startsWith("### ")) paths.push(t.slice(4).trim());
  }
  return paths;
}

function buildRepoDossier(repoDir: string, repo: ScoredRepo): string {
  const lines: string[] = [
    `# Ruro dossier for ${repo.signals.fullName}`,
    "",
    `Status ${repo.status} · score ${repo.score}`,
    `Demo ${repo.signals.demo.status}${repo.signals.demo.verified ? " verified" : ""}`,
    `Fitness ${repo.signals.fitness.score} (${repo.signals.fitness.sourceFiles} src / ${repo.signals.fitness.testFiles} tests)`,
    "",
    "## Tree (truncated)",
  ];

  const tree = spawnSync(
    "bash",
    [
      "-lc",
      "find . -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.py' -o -name '*.go' -o -name '*.rs' -o -name '*.md' -o -name 'package.json' -o -name 'pyproject.toml' -o -name 'Cargo.toml' -o -name 'go.mod' \\) ! -path './.git/*' ! -path './node_modules/*' ! -path './dist/*' ! -path './.next/*' | head -n 120",
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
    "src/main.ts",
    "src/index.ts",
    "src/App.tsx",
    "app/page.tsx",
  ];
  for (const rel of candidates) {
    const abs = join(repoDir, rel);
    if (!existsSync(abs)) continue;
    try {
      const raw = readFileSync(abs, "utf8").slice(0, 2500);
      lines.push("", `### ${rel}`, "```", raw, "```");
    } catch {
      /* skip */
    }
  }
  return `${lines.join("\n")}\n`;
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
    section(text, "Code review") ||
    section(text, "Code Review") ||
    text;
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
    `Demo: ${repo.signals.demo.status}.`,
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

function emptyPayload(status: string, note: string) {
  return {
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
): {
  status: string;
  note?: string;
  repos: RepoReview[];
} | null {
  const path = resolve(cwd, cacheDir, "latest.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as {
      status: string;
      note?: string;
      repos: RepoReview[];
    };
  } catch {
    return null;
  }
}
