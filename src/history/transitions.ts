import type { RepoStatus, RuroReport } from "../types.js";

export interface StatusTransition {
  fullName: string;
  name: string;
  url: string;
  from: RepoStatus;
  to: RepoStatus;
  scoreFrom: number;
  scoreTo: number;
}

export function computeTransitions(
  previous: RuroReport | null,
  current: RuroReport,
): StatusTransition[] {
  if (!previous) return [];
  const prevMap = new Map(
    previous.repos.map((r) => [
      r.signals.fullName,
      { status: r.status, score: r.score },
    ]),
  );

  const out: StatusTransition[] = [];
  for (const repo of current.repos) {
    const prior = prevMap.get(repo.signals.fullName);
    if (!prior) continue;
    if (prior.status === repo.status) continue;
    out.push({
      fullName: repo.signals.fullName,
      name: repo.signals.name,
      url: repo.signals.url,
      from: prior.status,
      to: repo.status,
      scoreFrom: prior.score,
      scoreTo: repo.score,
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}
