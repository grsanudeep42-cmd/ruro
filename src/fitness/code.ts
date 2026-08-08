import type { GithubClients } from "../github/collect.js";
import { withRetries } from "../github/retry.js";
import type { CodeFitness, RepoSignals } from "../types.js";

const SOURCE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|swift|c|cc|cpp|h|hpp|cs|rb|php|vue|svelte|scala|dart)$/i;
const TEST_HINT =
  /(^|\/)(tests?|__tests__|spec)(\/|$)|[._-](test|spec)\.[^.]+$/i;
const SKIP =
  /(^|\/)(node_modules|dist|build|\.git|vendor|coverage|\.next|target)(\/|$)/i;

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
    if (size > maxBlobBytes) maxBlobBytes = size;

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
      repo.fitness = analyzeTreeEntries(tree.data.tree);
    } catch {
      // private/token limits — leave tree_unavailable
    }
  }
}
