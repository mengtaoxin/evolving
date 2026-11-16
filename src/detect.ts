import { spawnSync } from "node:child_process";
import type { VerifyGate, VerifySuite } from "./types.ts";

/** True when a changed path matches a suite path pattern. */
export function pathMatches(changedPath: string, pattern: string): boolean {
  if (pattern.endsWith("/")) {
    return changedPath === pattern.slice(0, -1) || changedPath.startsWith(pattern);
  }
  return changedPath === pattern || changedPath.startsWith(`${pattern}/`);
}

export function changedPathsFromGit(cwd: string): string[] {
  const status = spawnSync("git", ["status", "--porcelain", "-z", "--untracked-files=all"], {
    cwd,
    encoding: "utf8",
  });
  if (status.status !== 0) return [];
  const fields = status.stdout.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i] as string;
    paths.push(entry.slice(3));
    if (entry[0] === "R" || entry[0] === "C") paths.push(fields[++i] ?? "");
  }
  return paths;
}

export function suiteIdsFromConfig(gate: VerifyGate): string[] {
  return Object.keys(gate.suites);
}

export function invalidSuiteArgs(
  suiteArgs: readonly string[],
  suiteIds: readonly string[],
): string[] {
  const allowed = new Set([...suiteIds, "all"]);
  return suiteArgs.filter((arg) => !allowed.has(arg));
}

/**
 * Suites selected for verify.
 * - Explicit args: named suites (or every suite for `all`). `also` is not applied.
 * - Git detect: suites whose paths match; then expand `also` edges once.
 */
export function resolveSuiteIds(
  gate: VerifyGate,
  suiteArgs: readonly string[],
  changedPaths: readonly string[],
): string[] {
  const ids = suiteIdsFromConfig(gate);
  if (suiteArgs.length > 0) {
    if (suiteArgs.includes("all")) return ids;
    return ids.filter((id) => suiteArgs.includes(id));
  }

  const selected = new Set<string>();
  for (const [id, suite] of Object.entries(gate.suites)) {
    if (suiteMatchesPaths(suite, changedPaths)) selected.add(id);
  }
  for (const id of [...selected]) {
    const also = gate.suites[id]?.also;
    if (!also) continue;
    for (const other of also) {
      if (gate.suites[other]) selected.add(other);
    }
  }
  return ids.filter((id) => selected.has(id));
}

function suiteMatchesPaths(suite: VerifySuite, changedPaths: readonly string[]): boolean {
  return changedPaths.some((changed) =>
    suite.paths.some((pattern) => pathMatches(changed, pattern)),
  );
}
