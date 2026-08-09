/** Terminal face — Ruri, fleet operator mascot. */

import { ansi, c } from "./tui.js";

/**
 * Ruri — small unique girl mark for the CLI (not a lobster clone).
 */
export function ruriArt(): string {
  const L = (s: string) => c("lime", s);
  const M = (s: string) => c("mute", s);
  const S = (s: string) => c("sand", s);
  const B = (s: string) => c("bold", c("ink", s));
  return [
    L("        .--.      "),
    L("       |o_o |     ") + B("  RURI"),
    L("       |:_/ |     ") + S("  ruro fleet operator"),
    L("      //   \\ \\    ") + M("  github os · no vibes"),
    L("     (|     | )   "),
    L("    /'\\_   _/`\\   "),
    L("    \\___)=(___/   "),
  ].join("\n");
}

export function printBanner(cmd: string): void {
  const bar = c("mute", "─".repeat(56));
  console.log("");
  console.log(bar);
  console.log(ruriArt());
  console.log(
    `  ${c("bold", c("ink", "RURO"))} ${c("mute", "v0.2.0")}  ${c("lime", "▸")} ${c("sand", cmd)}`,
  );
  console.log(
    c("mute", "  scan · view · top · status · why · review"),
  );
  console.log(bar);
  console.log("");
}

export function statusTone(status: string): string {
  switch (status) {
    case "LIVE":
      return c("lime", status);
    case "ACTIVE":
      return c("sand", status);
    case "STALE":
    case "DORMANT":
      return c("mute", status);
    case "DEAD":
    case "ARCHIVED":
      return c("red", status);
    default:
      return status;
  }
}

// re-export for older imports that expected color()
export function color(kind: keyof typeof ansi, text: string): string {
  return c(kind, text);
}
