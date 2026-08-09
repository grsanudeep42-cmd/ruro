/** Terminal face for Ruro — unique operator mascot (not a lobster clone). */

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  lime: "\x1b[38;2;214;255;60m",
  sand: "\x1b[38;2;196;184;160m",
  mute: "\x1b[38;2;138;134;124m",
  red: "\x1b[38;2;255;92;77m",
  ink: "\x1b[38;2;244;241;234m",
};

export function color(kind: keyof typeof C, text: string): string {
  if (!process.stdout.isTTY) return text;
  return `${C[kind]}${text}${C.reset}`;
}

/**
 * Ruri — fleet operator. Small unique girl mark for the CLI.
 */
export function ruriArt(): string {
  const L = (s: string) => color("lime", s);
  const M = (s: string) => color("mute", s);
  const S = (s: string) => color("sand", s);
  return [
    L("        .--.      "),
    L("       |o_o |     ") + M("  RURI"),
    L("       |:_/ |     ") + S("  ruro fleet operator"),
    L("      //   \\ \\    ") + M("  github os · no vibes"),
    L("     (|     | )   "),
    L("    /'\\_   _/`\\   "),
    L("    \\___)=(___/   "),
  ].join("\n");
}

export function printBanner(cmd: string): void {
  const bar = color("mute", "═".repeat(64));
  console.log(bar);
  console.log(ruriArt());
  console.log(
    `${color("bold", color("ink", "  RURO"))} ${color("mute", "v0.1.0")}  ${color("lime", "▸")} ${color("sand", cmd)}`,
  );
  console.log(
    color(
      "mute",
      "  scan · view · top · status · why · review    truth stays on github",
    ),
  );
  console.log(bar);
}

export function statusTone(status: string): string {
  switch (status) {
    case "LIVE":
      return color("lime", status);
    case "ACTIVE":
      return color("sand", status);
    case "STALE":
    case "DORMANT":
      return color("mute", status);
    case "DEAD":
    case "ARCHIVED":
      return color("red", status);
    default:
      return status;
  }
}
