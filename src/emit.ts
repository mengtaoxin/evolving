import { writeLastRun } from "./last-run.ts";
import { printJson, slimSuccessReport } from "./report.ts";
import type { RunReport } from "./types.ts";

/** Persist last-run and print JSON (success is slim; failure is full). */
export function emitRun(cwd: string, report: RunReport): RunReport {
  const persisted = writeLastRun(cwd, report);
  printJson(persisted.ok ? slimSuccessReport(persisted) : persisted);
  return persisted;
}
