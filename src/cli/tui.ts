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

export function startProgress(label: string): {
  tick: (msg?: string) => void;
  done: (msg?: string) => void;
  fail: (msg?: string) => void;
} {
  const t0 = Date.now();
  const tty = Boolean(process.stdout.isTTY);
  let frame = 0;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let timer: ReturnType<typeof setInterval> | null = null;
  let last = label;

  const render = (): void => {
    if (!tty) return;
    const spin = frames[frame % frames.length];
    frame += 1;
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(
      `\r  ${c("mute", "↳")} ${c("sand", `${spin} ${last}`)} ${c("mute", `${sec}s`)}   `,
    );
  };

  if (tty) {
    render();
    timer = setInterval(render, 80);
  } else {
    tool(`${label}…`);
  }

  const clearLine = (): void => {
    if (tty) process.stdout.write("\r" + " ".repeat(72) + "\r");
  };

  return {
    tick(msg?: string) {
      if (msg) last = msg;
    },
    done(msg?: string) {
      if (timer) clearInterval(timer);
      clearLine();
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      tool(`${msg ?? last} · ${sec}s`);
    },
    fail(msg?: string) {
      if (timer) clearInterval(timer);
      clearLine();
      tool(`${msg ?? last} · failed`);
    },
  };
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
  console.log(L("      //   \\ \\    ") + M("  github os · prove · operate"));
  console.log(L("     (|     | )   "));
  console.log(L("    /'\\_   _/`\\   "));
  console.log(L("    \\___)=(___/   "));
  console.log("");
  console.log(
    `  ${c("bold", c("ink", "RURO"))} ${c("mute", "v0.3.0")}  ${c("lime", "▸")} ${c("sand", "live")}`,
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
      "  /brief /diff /next /view /why /status · tab completes repos · /exit",
    ),
  );
  console.log(bar);
  console.log("");
}
