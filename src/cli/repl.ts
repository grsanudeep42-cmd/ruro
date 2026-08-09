import * as readline from "node:readline";
import type { RuroConfig } from "../config.js";
import { annotateWithCopilot, readAiCache } from "../ai/copilot.js";
import {
  findIn,
  narrateFull,
  narrateReview,
  narrateStatus,
  narrateTop,
  narrateView,
  narrateWhy,
  parseIntent,
} from "./narrate.js";
import { loadLatestReport } from "./view.js";
import { agent, c, printBoot, tool } from "./tui.js";
import { runRuro } from "../run.js";

function help(): void {
  agent(
    [
      "I’m Ruri — fleet operator for this GitHub OS.",
      "",
      "  view                 show path",
      "  top 5                ranked shortlist",
      "  aryanbloodbank      short dossier (any repo name)",
      "  full phantom         long dossier",
      "  why phantom          score math",
      "  review <repo>        Copilot audit",
      "  scan                 refresh truth",
      "",
      "Slash forms work too. /exit to leave.",
    ].join("\n"),
  );
}

export async function startRepl(opts: {
  config: RuroConfig;
  cwd?: string;
}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = opts.config;
  let report = loadLatestReport(config, cwd);

  printBoot({ owner: report.owner, repos: report.included_count });
  agent(
    `Online. Ask for the fleet, a repo name, why, or a review.`,
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c("lime", "›")} `,
    terminal: true,
  });

  const reload = (): void => {
    report = loadLatestReport(config, cwd);
    agent(
      `Reloaded · ${report.included_count} repos · ${report.generated_at.slice(0, 19)}`,
    );
  };

  const handle = async (line: string): Promise<"continue" | "exit"> => {
    const intent = parseIntent(line);
    try {
      switch (intent.kind) {
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
        case "top":
          narrateTop(report, intent.n ?? 5);
          return "continue";
        case "status":
          if (!intent.arg) {
            agent("Which repo? e.g. aryanbloodbank");
            return "continue";
          }
          narrateStatus(report, intent.arg);
          return "continue";
        case "full":
          if (!intent.arg) {
            agent("Which repo? e.g. full aryanbloodbank");
            return "continue";
          }
          narrateFull(report, intent.arg);
          return "continue";
        case "why":
          if (!intent.arg) {
            agent("Which repo? e.g. why phantom");
            return "continue";
          }
          narrateWhy(report, config, intent.arg);
          return "continue";
        case "review": {
          const token =
            process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
          if (!token) {
            agent("Set GITHUB_TOKEN (or GH_TOKEN) in this shell, then retry.");
            return "continue";
          }
          if (!intent.arg) {
            agent("Which repo? e.g. review aryanbloodbank");
            return "continue";
          }
          const target = findIn(report, intent.arg);
          tool(`auditing ${target.signals.fullName} with Copilot…`);
          const aiConfig = {
            ...config,
            ai: {
              ...config.ai,
              enabled: true,
              provider: "copilot" as const,
              top_n: 1,
            },
          };
          const result = await annotateWithCopilot({
            report: { ...report, repos: [target] },
            config: aiConfig,
            cwd,
            token,
          });
          if (result.skipped) {
            agent(`Audit skipped — ${result.reason ?? "unknown"}`);
          } else {
            agent(`Audit stored.`);
          }
          narrateReview(readAiCache(cwd, config.ai.cache_dir), intent.arg);
          return "continue";
        }
        case "scan": {
          const token =
            process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
          if (!token) {
            agent("Set GITHUB_TOKEN (or GH_TOKEN) to scan.");
            return "continue";
          }
          tool("scanning GitHub + probes + fitness…");
          const result = await runRuro({ token, config, cwd });
          agent(
            `Done · ${result.report.included_count} scored · lead ${result.report.repos[0]?.signals.name ?? "—"}`,
          );
          reload();
          return "continue";
        }
        default:
          agent(`Didn’t catch that. Try “view”, a repo name, or /help.`);
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
      rl.close();
      break;
    }
    rl.prompt();
  }
}
