const START = "<!-- RURO:START -->";
const END = "<!-- RURO:END -->";

export function injectRuroBlock(readme: string, block: string): string {
  const normalizedBlock = block.trim().endsWith(END)
    ? block.trim()
    : `${START}\n${block.trim()}\n${END}`;

  const startIdx = readme.indexOf(START);
  const endIdx = readme.indexOf(END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = readme.slice(0, startIdx);
    const after = readme.slice(endIdx + END.length);
    return `${before}${normalizedBlock}${after}`;
  }

  // Prefer replacing a PROJECTS section if present.
  const projectsMatch = readme.match(
    /##\s*[░]?\s*PROJECTS[\s\S]*?(?=\n##\s*[░]|\n---\s*\n|$)/i,
  );
  if (projectsMatch && projectsMatch.index !== undefined) {
    const before = readme.slice(0, projectsMatch.index);
    const after = readme.slice(projectsMatch.index + projectsMatch[0].length);
    return `${before}${normalizedBlock}\n\n${after}`.replace(/\n{3,}/g, "\n\n");
  }

  return `${readme.trimEnd()}\n\n${normalizedBlock}\n`;
}

export { START as RURO_START_MARKER, END as RURO_END_MARKER };
