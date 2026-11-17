import { spawnSync } from "node:child_process";
import type { Stage, StageCommand } from "./types.ts";
import { commandRefId, isRefOnlyCommand } from "./types.ts";

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

export function commandIdsFromStage(stage: Stage): string[] {
  return (stage.commands ?? []).map((c) => c.id);
}

export function invalidCommandArgs(
  args: readonly string[],
  commandIds: readonly string[],
): string[] {
  const allowed = new Set([...commandIds, "all"]);
  return args.filter((arg) => !arg.startsWith("--") && !allowed.has(arg));
}

/**
 * Command ids selected for a machine stage (composition entries included until expand).
 * - Explicit args: named ids (or every id for `all`). Always-on items still included.
 * - Git detect: always-on + path matches; then expand command:// edges.
 */
export function resolveSelectedCommandIds(
  stage: Stage,
  commandArgs: readonly string[],
  changedPaths: readonly string[],
): string[] {
  const commands = stage.commands ?? [];
  const ids = commandIdsFromStage(stage);
  const byId = new Map(commands.map((c) => [c.id, c]));
  const selected = new Set<string>();

  if (commandArgs.includes("all")) {
    for (const id of ids) selected.add(id);
  } else if (commandArgs.length > 0) {
    for (const cmd of commands) {
      if (!cmd.run_in_file_change) selected.add(cmd.id);
    }
    for (const arg of commandArgs) {
      if (byId.has(arg)) selected.add(arg);
    }
  } else {
    for (const cmd of commands) {
      if (!cmd.run_in_file_change) {
        selected.add(cmd.id);
        continue;
      }
      if (pathsMatch(cmd, changedPaths)) selected.add(cmd.id);
    }
  }

  expandCommandRefs(selected, byId);
  return ids.filter((id) => selected.has(id));
}

/** Ids that will actually be spawned (excludes command:// composition entries). */
export function runnableSelectedIds(
  stage: Stage,
  selectedIds: readonly string[],
): string[] {
  const byId = new Map((stage.commands ?? []).map((c) => [c.id, c]));
  return selectedIds.filter((id) => {
    const cmd = byId.get(id);
    return cmd !== undefined && !isRefOnlyCommand(cmd.command);
  });
}

export function alwaysOnIds(stage: Stage, selectedIds: readonly string[]): string[] {
  const byId = new Map((stage.commands ?? []).map((c) => [c.id, c]));
  return selectedIds.filter((id) => {
    const cmd = byId.get(id);
    return cmd !== undefined && !cmd.run_in_file_change && !isRefOnlyCommand(cmd.command);
  });
}

function pathsMatch(cmd: StageCommand, changedPaths: readonly string[]): boolean {
  const patterns = cmd.run_in_file_change;
  if (!patterns) return false;
  return changedPaths.some((changed) =>
    patterns.some((pattern) => pathMatches(changed, pattern)),
  );
}

function expandCommandRefs(
  selected: Set<string>,
  byId: ReadonlyMap<string, StageCommand>,
): void {
  const queue = [...selected];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    const cmd = byId.get(id);
    if (!cmd || !isRefOnlyCommand(cmd.command)) continue;
    for (const token of cmd.command) {
      const refId = commandRefId(token);
      if (selected.has(refId)) continue;
      selected.add(refId);
      queue.push(refId);
    }
  }
}
