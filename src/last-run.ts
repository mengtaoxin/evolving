import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunReport } from "./types.ts";

export function lastRunDir(cwd: string): string {
  return join(cwd, ".evolving");
}

export function lastRunPath(cwd: string): string {
  return join(lastRunDir(cwd), "last-run.json");
}

/** Directory for full per-step stdout/stderr logs (survive beyond /tmp). */
export function logsDir(cwd: string): string {
  return join(lastRunDir(cwd), "logs");
}

/** Persist the latest run report for agent resume. */
export function writeLastRun(cwd: string, report: RunReport): RunReport {
  const path = lastRunPath(cwd);
  const payload: RunReport = {
    ...report,
    finished_at: new Date().toISOString(),
    cwd,
    last_run_path: path,
  };
  mkdirSync(lastRunDir(cwd), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export function readLastRun(cwd: string): RunReport | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(lastRunPath(cwd), "utf8"));
    if (!isRunReport(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

function isRunReport(value: unknown): value is RunReport {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.evolving === 1 &&
    typeof obj.command === "string" &&
    typeof obj.ok === "boolean" &&
    typeof obj.exit_code === "number" &&
    Array.isArray(obj.steps) &&
    Array.isArray(obj.failed)
  );
}
