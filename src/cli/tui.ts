/** Agent-style terminal — Cursor / Claude Code energy + Ruri face. */

export const ansi = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  italic: "\x1b[3m",
  lime: "\x1b[38;2;214;255;60m",
  sand: "\x1b[38;2;196;184;160m",
  mute: "\x1b[38;2;120;116;108m",
  ink: "\x1b[38;2;244;241;234m",
  red: "\x1b[38;2;255;92;77m",
  sky: "\x1b[38;2;125;211;252m",
};

export function c(kind: keyof typeof ansi, text: string): string {
  if (!process.stdout.isTTY) return text;
  return `${ansi[kind]}${text}${ansi.reset}`;
}

export function say(text: string): void {
  for (const line of text.split("\n")) {
    console.log(`  ${line}`);
  }
}

export function agent(text: string): void {
  console.log("");
  console.log(`${c("lime", "●")} ${c("bold", "ruri")} ${c("mute", "·")}`);
  for (const line of text.split("\n")) {
    console.log(`  ${c("ink", line)}`);
  }
  console.log("");
}

export function note(text: string): void {
  console.log(`  ${c("mute", text)}`);
}

export function item(text: string): void {
  console.log(`  ${c("lime", "·")} ${text}`);
}

export function tool(label: string): void {
  console.log(`  ${c("mute", "↳")} ${c("sand", label)}`);
}

/** Live session boot — ASCII Ruri + soft Claude/Cursor chrome. */
export function printBoot(meta?: { owner?: string; repos?: number }): void {
  const bar = c("mute", "─".repeat(56));
  const L = (s: string) => c("lime", s);
  const M = (s: string) => c("mute", s);
  const S = (s: string) => c("sand", s);
  const B = (s: string) => c("bold", c("ink", s));

  console.log("");
  console.log(bar);
  console.log(L("        .--.      "));
  console.log(L("       |o_o |     ") + B("  RURI"));
  console.log(L("       |:_/ |     ") + S("  ruro fleet operator"));
  console.log(L("      //   \\ \\    ") + M("  github os · no vibes"));
  console.log(L("     (|     | )   "));
  console.log(L("    /'\\_   _/`\\   "));
  console.log(L("    \\___)=(___/   "));
  console.log("");
  console.log(
    `  ${c("bold", c("ink", "RURO"))} ${c("mute", "v0.1.0")}  ${c("lime", "▸")} ${c("sand", "live")}`,
  );
  if (meta?.owner) {
    console.log(
      c(
        "mute",
        `  owner=${meta.owner}${meta.repos != null ? `  repos=${meta.repos}` : ""}`,
      ),
    );
  }
  console.log(
    c(
      "mute",
      "  talk naturally · /view /status /why /review /scan · /exit",
    ),
  );
  console.log(bar);
  console.log("");
}
