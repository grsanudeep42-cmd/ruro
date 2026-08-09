import * as readline from "node:readline";
import type { RuroConfig } from "../config.js";
import { annotateWithCopilot, readAiCache } from "../ai/copilot.js";
import {
  findIn,
  narrateBrief,
  narrateDiff,
  narrateFull,
  narrateNext,
  narrateReview,
  narrateStatus,
  narrateTop,
  narrateView,
  narrateWhy,
  parseIntent,
} from "./narrate.js";
import { loadLatestReport } from "./view.js";
import { agent, c, printBoot, startProgress } from "./tui.js";
import { runRuro } from "../run.js";

function help(): void {
  agent(
    [
      "Ruri — fleet operator. Deterministic truth first; Copilot is optional.",
      "",
      "  brief / next / diff     operator surfaces (demo these)",
      "  view / top 5            fleet path",
      "  <repo> / status <repo>  dossier + deploy proof",
      "  why <repo>              contribution math + fixes",
      "  scan                    refresh truth",
      "  review <repo>           Copilot judgment (garnish)",
      "",
      "Tab completes repo names. Blank line is silent. /exit to leave.",
    ].join("\n"),
  );
}

function completer(reportRepos: string[]): readline.Completer {
  const cmds = [
    "brief",
    "next",
    "diff",
    "view",
    "top",
    "status",
    "why",
    "full",
    "scan",
    "review",
    "help",
    "exit",
  ];
  return (line: string): [string[], string] => {
    const parts = line.split(/\s+/);
    const last = parts[parts.length - 1] ?? "";
    const pool =
      parts.length <= 1
        ? [...cmds, ...reportRepos]
        : reportRepos;
    const hits = pool.filter((name) => name.startsWith(last));
    return [hits.length ? hits : pool, last];
  };
}

export async function startRepl(opts: {
  config: RuroConfig;
  cwd?: string;
}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = opts.config;
  let report = loadLatestReport(config, cwd);
  let abort: AbortController | null = null;
  const repoNames = report.repos.map((r) => r.signals.name);

  printBoot({ owner: report.owner, repos: report.included_count });
  agent(`Online. Start with brief — or a repo name. Copilot is optional.`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c("lime", "›")} `,
    terminal: true,
    completer: completer(repoNames),
  });

  const reload = (): void => {
    report = loadLatestReport(config, cwd);
    repoNames.splice(0, repoNames.length, ...report.repos.map((r) => r.signals.name));
    agent(
      `Reloaded · ${report.included_count} repos · ${report.generated_at.slice(0, 19)}`,
    );
  };

  const onSigInt = (): void => {
    if (abort) {
      abort.abort();
      abort = null;
      agent("Cancelled.");
    }
  };
  process.on("SIGINT", onSigInt);

  const handle = async (line: string): Promise<"continue" | "exit"> => {
    const intent = parseIntent(line);
    try {
      switch (intent.kind) {
        case "empty":
          return "continue";
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
          const prog = startProgress(`auditing ${target.signals.name}`);
          abort = new AbortController();
          try {
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
            if (abort.signal.aborted) {
              prog.fail("cancelled");
              return "continue";
            }
            prog.done(result.skipped ? "audit skipped" : "audit stored");
            if (result.skipped) {
              agent(`Audit skipped — ${result.reason ?? "unknown"}`);
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
          const token =
            process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
          if (!token) {
            agent("Set GITHUB_TOKEN (or GH_TOKEN) to scan.");
            return "continue";
          }
          const prog = startProgress("scanning GitHub + probes + fitness");
          abort = new AbortController();
          try {
            const result = await runRuro({ token, config, cwd });
            if (abort.signal.aborted) {
              prog.fail("cancelled");
              return "continue";
            }
            prog.done(
              `scored ${result.report.included_count} · lead ${result.report.repos[0]?.signals.name ?? "—"}`,
            );
            agent(
              `Done · ${result.report.included_count} scored · lead ${result.report.repos[0]?.signals.name ?? "—"}`,
            );
            reload();
          } catch (err) {
            prog.fail("scan failed");
            throw err;
          } finally {
            abort = null;
          }
          return "continue";
        }
        default:
          agent(`Unknown. Try brief, next, diff, view, a repo name, or /help.`);
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
      process.off("SIGINT", onSigInt);
      rl.close();
      break;
    }
    rl.prompt();
  }
}
