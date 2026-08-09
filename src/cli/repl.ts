import * as readline from "node:readline";
import type { RuroConfig } from "../config.js";
import { annotateWithCopilot, readAiCache } from "../ai/copilot.js";
import { color, printBanner, ruriArt } from "./banner.js";
import {
  findRepo,
  loadLatestReport,
  printReviews,
  printStatus,
  printTop,
  printView,
  printWhy,
} from "./view.js";
import { runRuro } from "../run.js";

function helpLive(): void {
  console.log(`
 ${color("lime", "live session")} — type a command, Ruri stays up

  view                 fleet board
  top [n]              top N showables
  status <repo>        full dossier + audit cache
  why <repo>           score math + explained codes
  review <repo>        Copilot audit (needs GITHUB_TOKEN)
  scan                 refresh truth (needs GITHUB_TOKEN)
  reload               re-read data/latest.json
  clear                clear screen + banner
  help                 this help
  exit | quit | q      leave session
`);
}

export async function startRepl(opts: {
  config: RuroConfig;
  cwd?: string;
}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  let config = opts.config;
  let report = loadLatestReport(config, cwd);

  printBanner("live");
  console.log(color("mute", "  OpenClaw-style session. Commands keep running until you exit."));
  console.log(color("mute", `  owner=${report.owner}  repos=${report.included_count}  generated=${report.generated_at.slice(0, 19)}`));
  console.log(color("mute", "  type help · exit with q"));
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: color("lime", "ruro") + color("mute", " › "),
    terminal: true,
  });

  const reload = (): void => {
    report = loadLatestReport(config, cwd);
    console.log(
      color("mute", `[ruro] reloaded ${report.included_count} repos @ ${report.generated_at.slice(0, 19)}`),
    );
  };

  const runLine = async (line: string): Promise<"continue" | "exit"> => {
    const raw = line.trim();
    if (!raw) return "continue";
    const parts = raw.split(/\s+/);
    const cmd = parts[0]?.toLowerCase() ?? "";
    const args = parts.slice(1);

    try {
      if (cmd === "exit" || cmd === "quit" || cmd === "q") {
        console.log(color("sand", "  ruri out."));
        return "exit";
      }
      if (cmd === "help" || cmd === "?") {
        helpLive();
        return "continue";
      }
      if (cmd === "clear") {
        console.clear();
        printBanner("live");
        console.log(ruriArt());
        return "continue";
      }
      if (cmd === "reload") {
        reload();
        return "continue";
      }
      if (cmd === "view") {
        printView(report);
        return "continue";
      }
      if (cmd === "top") {
        const n = args[0] ? Number.parseInt(args[0], 10) : 5;
        if (!Number.isFinite(n) || n < 1) {
          console.error("usage: top [n]");
          return "continue";
        }
        printTop(report, n);
        return "continue";
      }
      if (cmd === "status") {
        if (!args[0]) {
          console.error("usage: status <repo>");
          return "continue";
        }
        printStatus(report, args[0]);
        printReviews(readAiCache(cwd, config.ai.cache_dir), args[0]);
        return "continue";
      }
      if (cmd === "why" || cmd === "explain") {
        if (!args[0]) {
          console.error("usage: why <repo>");
          return "continue";
        }
        printWhy(report, config, args[0]);
        return "continue";
      }
      if (cmd === "review") {
        const token =
          process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
        if (!token) {
          console.error("set GITHUB_TOKEN / GH_TOKEN for review");
          return "continue";
        }
        const query = args[0];
        const aiConfig = {
          ...config,
          ai: {
            ...config.ai,
            enabled: true,
            provider: "copilot" as const,
            top_n: query ? 1 : config.ai.top_n,
          },
        };
        const scoped = query
          ? { ...report, repos: [findRepo(report, query)] }
          : { ...report, repos: report.repos.slice(0, config.ai.top_n) };
        console.log(
          color(
            "mute",
            `[ruro] reviewing ${scoped.repos.map((r) => r.signals.name).join(", ")}…`,
          ),
        );
        const result = await annotateWithCopilot({
          report: scoped,
          config: aiConfig,
          cwd,
          token,
        });
        console.log(
          result.skipped
            ? `[ruro] skipped: ${result.reason ?? "unknown"}`
            : `[ruro] audited ${result.annotated}`,
        );
        printReviews(readAiCache(cwd, config.ai.cache_dir), query);
        return "continue";
      }
      if (cmd === "scan") {
        const token =
          process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
        if (!token) {
          console.error("set GITHUB_TOKEN / GH_TOKEN for scan");
          return "continue";
        }
        console.log(color("mute", "[ruro] scanning…"));
        const result = await runRuro({ token, config, cwd });
        console.log(
          `[ruro] scored ${result.report.included_count} → ${result.dashboardPath}`,
        );
        reload();
        return "continue";
      }

      console.error(`unknown: ${cmd}  (type help)`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
    }
    return "continue";
  };

  rl.prompt();
  for await (const line of rl) {
    const next = await runLine(line);
    if (next === "exit") {
      rl.close();
      break;
    }
    rl.prompt();
  }
}
