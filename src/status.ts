import { lastRunPath, readLastRun } from "./last-run.ts";
import { buildFailureSummaries, printJson } from "./report.ts";
import type { FailureSummary, RunReport, StatusReport } from "./types.ts";

export function buildStatus(cwd: string, options: { full?: boolean } = {}): StatusReport {
  const full = options.full === true;
  const last = readLastRun(cwd);
  if (!last) {
    return {
      evolving: 1,
      command: "status",
      state: "none",
      ok: null,
      next: ["explain"],
    };
  }

  const path = last.last_run_path ?? lastRunPath(cwd);
  const failure = failuresFrom(last);

  if (last.ok) {
    return {
      evolving: 1,
      command: "status",
      state: "ok",
      ok: true,
      last_run_path: path,
      ...(full ? { last_run: last } : {}),
      next: [],
    };
  }

  return {
    evolving: 1,
    command: "status",
    state: "failed",
    ok: false,
    failed: [...last.failed],
    failure,
    last_run_path: path,
    ...(full ? { last_run: last } : {}),
    next: suggestNext(last),
  };
}

export function printStatus(cwd: string, options: { full?: boolean } = {}): StatusReport {
  const status = buildStatus(cwd, options);
  printJson(status);
  return status;
}

function failuresFrom(last: RunReport): FailureSummary[] {
  if (Array.isArray(last.failure) && last.failure.length > 0) {
    return [...last.failure];
  }
  if (last.failed.length === 0) return [];
  return buildFailureSummaries(last.failed, last.steps);
}

function suggestNext(last: RunReport): string[] {
  const failedSteps = last.steps.filter((s) => !s.ok);
  const withFix = failedSteps.filter((s) => s.fix && s.fix.length > 0);
  if (withFix.length > 0 || last.command === "prepare") {
    if (last.command === "prepare") return ["prepare"];
    return ["prepare", last.command, ...verifyResumeArgs(last, failedSteps)];
  }
  if (last.command === "verify") {
    return ["verify", ...verifyResumeArgs(last, failedSteps)];
  }
  return [last.command];
}

/** Suite args for resume; omit when an always gate failed (full verify). */
function verifyResumeArgs(last: RunReport, failedSteps: RunReport["steps"]): string[] {
  if (last.command !== "verify" || !last.verify) return [];
  if (last.verify.check_only) return ["--check"];
  const alwaysNames = new Set(last.verify.always);
  if (failedSteps.some((s) => alwaysNames.has(s.name))) {
    return [];
  }
  return [...last.verify.selected_suites];
}
