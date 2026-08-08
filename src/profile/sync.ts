import { Octokit } from "@octokit/rest";
import type { RuroConfig } from "../config.js";
import { withRetries } from "../github/retry.js";
import { injectRuroBlock } from "./inject.js";

export interface ProfileSyncResult {
  updated: boolean;
  repo: string;
  path: string;
  sha?: string;
}

export async function syncProfileReadme(
  token: string,
  config: RuroConfig,
  snippetMarkdown: string,
): Promise<ProfileSyncResult> {
  const profile = config.profile;
  if (!profile.enabled) {
    return { updated: false, repo: "", path: "" };
  }

  const [owner, repo] = profile.repo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid profile.repo: ${profile.repo}`);
  }

  const octokit = new Octokit({ auth: token, userAgent: "ruro/0.1" });
  const path = profile.readme_path;

  const existing = await withRetries(`profile:get:${profile.repo}`, () =>
    octokit.repos.getContent({ owner, repo, path }),
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
      sha: file.sha,
    };
  }

  const written = await withRetries(`profile:put:${profile.repo}`, () =>
    octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: profile.commit_message,
      content: Buffer.from(next, "utf8").toString("base64"),
      sha: file.sha,
      committer: {
        name: "Anudeep GRS",
        email: "grsanudeep42@gmail.com",
      },
      author: {
        name: "Anudeep GRS",
        email: "grsanudeep42@gmail.com",
      },
    }),
  );

  return {
    updated: true,
    repo: profile.repo,
    path,
    sha: written.data.content?.sha,
  };
}
