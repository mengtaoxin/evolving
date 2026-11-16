import { writeLastRun } from "./last-run.ts";
import { printJson } from "./report.ts";
import type { OutputMode, RunReport } from "./types.ts";

/** Persist last-run and optionally print JSON (human output already streamed). */
export function emitRun(cwd: string, report: RunReport, mode: OutputMode): RunReport {
  const persisted = writeLastRun(cwd, report);
  if (mode === "json") printJson(persisted);
  return persisted;
}
