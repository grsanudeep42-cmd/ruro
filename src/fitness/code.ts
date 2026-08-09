import type { GithubClients } from "../github/collect.js";
import { withRetries } from "../github/retry.js";
import type { CodeFitness, RepoSignals } from "../types.js";

const SOURCE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|swift|c|cc|cpp|h|hpp|cs|rb|php|vue|svelte|scala|dart)$/i;
const TEST_HINT =
  /(^|\/)(tests?|__tests__|spec)(\/|$)|[._-](test|spec)\.[^.]+$/i;
const SKIP =
  /(^|\/)(node_modules|dist|build|\.git|vendor|coverage|\.next|target)(\/|$)/i;
const BINARYish =
  /\.(png|jpe?g|gif|webp|ico|mp4|mov|wav|mp3|pdf|zip|gz|tgz|wasm|woff2?|ttf|eot|psd|ai)$/i;

const MANIFEST =
  /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|requirements\.txt|composer\.json|Gemfile|pom\.xml|build\.gradle)$/i;
const LOCKFILE =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock)$/i;
const LINT =
  /(^|\/)(\.eslintrc|\.eslintrc\.(js|cjs|json|yml|yaml)|eslint\.config\.(js|cjs|mjs|ts)|ruff\.toml|\.prettierrc(\..+)?|prettier\.config\.(js|cjs|mjs)|biome\.json)$/i;
const TEST_TOOL =
  /(^|\/)(vitest\.config\.[cm]?[jt]s|jest\.config\.[cm]?[jt]s|pytest\.ini|conftest\.py|playwright\.config\.[cm]?[jt]s|cypress\.config\.[cm]?[jt]s)$/i;
const WORKFLOW = /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i;
const DEPENDABOT = /(^|\/)\.github\/dependabot\.ya?ml$/i;
const CODEOWNERS = /(^|\/)(\.github\/)?CODEOWNERS$/i;
const DOCKER = /(^|\/)(Dockerfile|Containerfile)(\.|$)/i;
const SRC_LAYOUT = /(^|\/)src\//;
const LICENSE = /(^|\/)LICENSE(\.|$)/i;

function emptyFitness(): CodeFitness {
  return {
    sourceFiles: 0,
    testFiles: 0,
    otherFiles: 0,
    maxBlobBytes: 0,
    score: 0,
    flags: ["tree_unavailable"],
  };
}

/** Path classifiers — tree is the source of truth for structure flags. */
export interface TreeSignalPatch {
  hasPackageManifest: boolean;
  hasLockfile: boolean;
  hasLintConfigHeuristic: boolean;
  hasWorkflows: boolean;
  hasDependabotConfig: boolean;
  hasCodeowners: boolean;
  hasContainerfile: boolean;
  hasSrcLayout: boolean;
  hasLicenseFile: boolean;
  hasTestsHeuristic: boolean;
  hasTestScript: boolean;
}

export function classifyTreePaths(
  entries: Array<{ path?: string; type?: string; size?: number }>,
): TreeSignalPatch {
  const paths = entries
    .filter((e) => e.type === "blob" && e.path && !SKIP.test(e.path))
    .map((e) => e.path!);

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
    hasTestScript,
  };
}

export function applyTreeSignals(
  repo: RepoSignals,
  patch: TreeSignalPatch,
): void {
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

export function analyzeTreeEntries(
  entries: Array<{ path?: string; type?: string; size?: number }>,
): CodeFitness {
  let sourceFiles = 0;
  let testFiles = 0;
  let otherFiles = 0;
  let maxBlobBytes = 0;
  const flags: string[] = [];

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

  if (maxBlobBytes > 250_000) {
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
    flags: flags.slice(0, 8),
  };
}

/** Fetch recursive tree → fitness + structure flags. Soft-fail leaves tree_unavailable. */
export async function enrichCodeFitness(
  clients: GithubClients,
  repos: RepoSignals[],
): Promise<void> {
  for (const repo of repos) {
    repo.fitness = emptyFitness();
    const [owner, name] = repo.fullName.split("/");
    const branch = repo.defaultBranch;
    if (!owner || !name || !branch) continue;

    try {
      const ref = await withRetries(
        `ref:${repo.fullName}`,
        () =>
          clients.octokit.git.getRef({
            owner,
            repo: name,
            ref: `heads/${branch}`,
          }),
        { attempts: 2, baseDelayMs: 200 },
      );
      const sha = ref.data.object.sha;
      const tree = await withRetries(
        `tree:${repo.fullName}`,
        () =>
          clients.octokit.git.getTree({
            owner,
            repo: name,
            tree_sha: sha,
            recursive: "true",
          }),
        { attempts: 2, baseDelayMs: 200 },
      );
      const entries = tree.data.tree;
      repo.fitness = analyzeTreeEntries(entries);
      applyTreeSignals(repo, classifyTreePaths(entries));
    } catch {
      // private/token limits — leave tree_unavailable; keep GraphQL defaults
    }
  }
}
