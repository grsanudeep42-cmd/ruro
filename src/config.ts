import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";

const WeightsSchema = z
  .object({
    quality: z.number().min(0).max(1),
    alive: z.number().min(0).max(1),
    structure: z.number().min(0).max(1),
  })
  .refine(
    (w) => Math.abs(w.quality + w.alive + w.structure - 1) < 1e-6,
    "weights must sum to 1",
  );

const ConfigSchema = z.object({
  schema_version: z.literal(1),
  owner: z.string().min(1),
  scan: z.object({
    include_private: z.boolean().default(true),
    include_forks: z.boolean().default(false),
    include_archived: z.boolean().default(true),
    exclude_repos: z.array(z.string()).default([]),
  }),
  weights: WeightsSchema,
  thresholds: z.object({
    active_days: z.number().int().positive(),
    stale_days: z.number().int().positive(),
    dormant_days: z.number().int().positive(),
  }),
  probes: z.object({
    enabled: z.boolean().default(true),
    timeout_ms: z.number().int().positive().default(8000),
    user_agent: z.string().default("ruro-probe/0.1"),
    follow_redirects: z.boolean().default(true),
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
    overview_path: z.string().default("OVERVIEW.md"),
  }),
  privacy: z
    .object({
      mode: z.enum(["full", "public_only_render"]).default("full"),
    })
    .default({ mode: "full" }),
  profile: z
    .object({
      enabled: z.boolean().default(false),
      repo: z.string().default(""),
      readme_path: z.string().default("README.md"),
      commit_message: z
        .string()
        .default("chore(ruro): refresh profile portfolio truth"),
    })
    .default({
      enabled: false,
      repo: "",
      readme_path: "README.md",
      commit_message: "chore(ruro): refresh profile portfolio truth",
    }),
  ai: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["copilot", "none"]).default("none"),
      top_n: z.number().int().positive().default(5),
      cache_dir: z.string().default("data/ai"),
      /** Per-repo Copilot CLI timeout (ms). */
      timeout_ms: z.number().int().positive().default(180_000),
    })
    .default({
      enabled: false,
      provider: "none",
      top_n: 5,
      cache_dir: "data/ai",
      timeout_ms: 180_000,
    }),
});

export type RuroConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(path: string, ownerOverride?: string): RuroConfig {
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

export function defaultConfig(owner: string): RuroConfig {
  return ConfigSchema.parse({
    schema_version: 1,
    owner,
    scan: {
      include_private: true,
      include_forks: false,
      include_archived: true,
      exclude_repos: ["ruro", ".github"],
    },
    weights: { quality: 0.4, alive: 0.35, structure: 0.25 },
    thresholds: { active_days: 90, stale_days: 180, dormant_days: 365 },
    probes: {
      enabled: true,
      timeout_ms: 8000,
      user_agent: "ruro-probe/0.1",
      follow_redirects: true,
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
      overview_path: "OVERVIEW.md",
    },
    privacy: { mode: "full" },
    profile: {
      enabled: false,
      repo: `${owner}/${owner}`,
      readme_path: "README.md",
      commit_message: "chore(ruro): refresh profile portfolio truth",
    },
    ai: {
      enabled: false,
      provider: "none",
      top_n: 5,
      cache_dir: "data/ai",
      timeout_ms: 180_000,
    },
  });
}
