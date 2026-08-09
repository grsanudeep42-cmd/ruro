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
import {
  filterSlashCommands,
  resolveSlashPrefix,
  SLASH_COMMANDS,
} from "./slash.js";
import { loadLatestReport } from "./view.js";
import {
  agent,
  c,
  eraseSlashMenu,
  printBoot,
  printSlashMenu,
  startProgress,
} from "./tui.js";
import { runRuro } from "../run.js";

function help(): void {
  printSlashMenu(SLASH_COMMANDS, "menu");
}

function completer(reportNames: string[]): readline.Completer {
  return (line: string): [string[], string] => {
    if (line.startsWith("/")) {
      const rest = line.slice(1);
      const space = rest.indexOf(" ");
      if (space < 0) {
        const hits = filterSlashCommands(rest).map((x) => `/${x.cmd}`);
        return [hits.length ? hits : SLASH_COMMANDS.map((x) => `/${x.cmd}`), line];
      }
      const after = rest.slice(space + 1);
      const hits = reportNames.filter((n) => n.startsWith(after));
      const prefix = line.slice(0, line.length - after.length);
      return [hits.map((n) => prefix + n), after];
    }

    const parts = line.split(/\s+/);
    const last = parts[parts.length - 1] ?? "";
    const cmds = SLASH_COMMANDS.map((x) => x.cmd);
    const pool =
      parts.length <= 1 ? [...cmds, ...reportNames] : [...reportNames];
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
  agent(`Online. Type / for the menu. Tab completes. Enter runs.`);
  if (report.owner.toLowerCase() !== config.owner.toLowerCase()) {
    agent(
      [
        `Heads-up: scorecard on disk is for “${report.owner}”, but ruro.yml owner is “${config.owner}”.`,
        `Copy the template, set your login, then /scan:`,
        `  cp ruro.example.yml ruro.yml`,
      ].join("\n"),
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c("lime", "›")} `,
    terminal: true,
    completer: completer(repoNames),
  });

  let slashMenuShownFor = "";
  let slashMenuLines = 0;
  let slashAlreadyVisible = false;

  const redrawSlashMenu = (partial: string): void => {
    const filtered = filterSlashCommands(partial);
    const list = filtered.length ? filtered : SLASH_COMMANDS;
    const signature = `${partial}|${list.map((x) => x.cmd).join(",")}`;
    if (signature === slashMenuShownFor) return;
    slashMenuShownFor = signature;
    if (slashMenuLines > 0) eraseSlashMenu(slashMenuLines);
    slashMenuLines = printSlashMenu(list, partial || "menu");
    slashAlreadyVisible = true;
    rl.prompt(true);
  };

  const clearSlashUi = (): void => {
    if (slashMenuLines > 0) eraseSlashMenu(slashMenuLines);
    slashMenuLines = 0;
    slashMenuShownFor = "";
    slashAlreadyVisible = false;
  };

  readline.emitKeypressEvents(process.stdin, rl);
  const onKeypress = (_str: string, key: { name?: string; ctrl?: boolean; meta?: boolean }): void => {
    if (!key || key.ctrl || key.meta) return;
    // Never redraw on Enter — line handler owns that
    if (key.name === "return" || key.name === "enter") return;
    if (key.name === "escape") {
      clearSlashUi();
      rl.prompt(true);
      return;
    }
    setImmediate(() => {
      const line = rl.line ?? "";
      if (!line.startsWith("/")) {
        clearSlashUi();
        return;
      }
      if (line.includes(" ", 1)) {
        clearSlashUi();
        return;
      }
      redrawSlashMenu(line.slice(1).toLowerCase());
    });
  };
  process.stdin.on("keypress", onKeypress);

  const reload = (): void => {
    report = loadLatestReport(config, cwd);
    repoNames.splice(
      0,
      repoNames.length,
      ...report.repos.map((r) => r.signals.name),
    );
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
    // Enter on bare "/" while menu already showing → don't reprint
    if (line.trim() === "/" && slashAlreadyVisible) {
      clearSlashUi();
      agent("Pick a command (e.g. /brief) or keep typing to filter.");
      return "continue";
    }

    // Expand unique prefix before parse: /br → /brief
    let input = line;
    const bare = line.trim().match(/^\/([a-z]+)$/i);
    if (bare) {
      const hit = resolveSlashPrefix(bare[1]);
      if (hit) input = `/${hit.cmd}`;
    }

    clearSlashUi();
    const intent = parseIntent(input);
    try {
      switch (intent.kind) {
        case "empty":
          return "continue";
        case "menu": {
          const filtered = filterSlashCommands(intent.arg ?? "");
          const list = filtered.length ? filtered : SLASH_COMMANDS;
          printSlashMenu(list, intent.arg || "menu");
          return "continue";
        }
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
            agent("Which repo? e.g. /status aryanbloodbank");
            return "continue";
          }
          narrateStatus(report, intent.arg);
          return "continue";
        case "full":
          if (!intent.arg) {
            agent("Which repo? e.g. /full aryanbloodbank");
            return "continue";
          }
          narrateFull(report, intent.arg);
          return "continue";
        case "why":
          if (!intent.arg) {
            agent("Which repo? e.g. /why phantom");
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
            agent("Which repo? e.g. /review aryanbloodbank");
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
              signal: abort.signal,
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
            const result = await runRuro({
              token,
              config,
              cwd,
              signal: abort.signal,
            });
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
            if (abort?.signal.aborted || (err instanceof Error && err.message === "aborted")) {
              prog.fail("cancelled");
              return "continue";
            }
            prog.fail("scan failed");
            throw err;
          } finally {
            abort = null;
          }
          return "continue";
        }
        default:
          agent(`Unknown. Type / for the command menu.`);
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
      process.stdin.off("keypress", onKeypress);
      process.off("SIGINT", onSigInt);
      rl.close();
      break;
    }
    rl.prompt();
  }
}
