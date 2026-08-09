/** Slash command catalog — Cursor-style action + description menu. */

export interface SlashCommand {
  cmd: string;
  description: string;
  /** Hint shown after the name, e.g. "<repo>" */
  args?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    cmd: "brief",
    description: "Operator briefing — show path, regressions, next fixes",
  },
  {
    cmd: "next",
    description: "Highest-leverage blockers with concrete playbook steps",
  },
  {
    cmd: "diff",
    description: "Fleet regressions vs previous history day",
  },
  {
    cmd: "view",
    description: "Fleet show path (ranked shortlist)",
  },
  {
    cmd: "top",
    args: "[n]",
    description: "Top N repos by showability (default 5)",
  },
  {
    cmd: "status",
    args: "<repo>",
    description: "Short dossier + auditable deploy proof",
  },
  {
    cmd: "full",
    args: "<repo>",
    description: "Long dossier with explained drivers/blockers",
  },
  {
    cmd: "why",
    args: "<repo>",
    description: "Score math, biggest movers, playbook fixes",
  },
  {
    cmd: "scan",
    description: "Refresh GitHub truth, probes, proofs (needs token)",
  },
  {
    cmd: "review",
    args: "<repo>",
    description: "Optional Copilot judgment — never moves scores",
  },
  {
    cmd: "reload",
    description: "Reload latest.json from disk",
  },
  {
    cmd: "clear",
    description: "Clear the screen and redraw Ruri boot",
  },
  {
    cmd: "help",
    description: "Show this command menu",
  },
  {
    cmd: "exit",
    description: "Leave the live session",
  },
];

export function filterSlashCommands(prefix: string): SlashCommand[] {
  const p = prefix.replace(/^\//, "").toLowerCase();
  if (!p) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(p));
}
