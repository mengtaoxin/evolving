import { existsSync } from "node:fs";
import { loadConfig } from "./load-config.ts";
import { lastRunPath, readLastRun } from "./last-run.ts";
import { buildFailureSummaries, printJson } from "./report.ts";
import { nearestPriorAgentStage, readCurrentStepAction } from "./stages-access.ts";
import type {
  EvolvingConfig,
  FailureSummary,
  ReportStep,
  RunReport,
  StatusReport,
} from "./types.ts";

const LOGS_MISSING_NOTE =
  "step.log under OS tmp is gone; re-run the failed stage to regenerate — do not Read a missing path";

export function buildStatus(
  cwd: string,
  options: { full?: boolean; config?: EvolvingConfig | null } = {},
): StatusReport {
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
  const { failure, logs_missing, last_run } = withLogAvailability(last);

  if (last.ok) {
    return {
      evolving: 1,
      command: "status",
      state: "ok",
      ok: true,
      last_run_path: path,
      ...(logs_missing ? { logs_missing: true, logs_note: LOGS_MISSING_NOTE } : {}),
      ...(full ? { last_run } : {}),
      next: [],
    };
  }

  const config = options.config === undefined ? tryConfig(cwd) : options.config;

  return {
    evolving: 1,
    command: "status",
    state: "failed",
    ok: false,
    failed: [...last.failed],
    failure,
    last_run_path: path,
    ...(logs_missing ? { logs_missing: true, logs_note: LOGS_MISSING_NOTE } : {}),
    ...(full ? { last_run } : {}),
    next: suggestNext(last, config),
  };
}

export function printStatus(cwd: string, options: { full?: boolean } = {}): StatusReport {
  const status = buildStatus(cwd, options);
  printJson(status);
  return status;
}

function tryConfig(cwd: string): EvolvingConfig | null {
  try {
    return loadConfig(cwd);
  } catch {
    return null;
  }
}

function failuresFrom(last: RunReport): FailureSummary[] {
  if (Array.isArray(last.failure) && last.failure.length > 0) {
    return [...last.failure];
  }
  if (last.failed.length === 0) return [];
  return buildFailureSummaries(last.failed, last.steps);
}

/** Drop dead step.log paths so agents are not told to Read missing files. */
function withLogAvailability(last: RunReport): {
  failure: FailureSummary[];
  logs_missing: boolean;
  last_run: RunReport;
} {
  const logs_missing = referencedLogsMissing(last);
  const failure = failuresFrom(last).map(scrubFailureLog);
  const steps = last.steps.map(scrubStepLog);
  return {
    failure,
    logs_missing,
    last_run: { ...last, steps, failure },
  };
}

function referencedLogsMissing(last: RunReport): boolean {
  for (const step of last.steps) {
    if (step.log && !existsSync(step.log)) return true;
  }
  for (const item of last.failure ?? []) {
    if (item.log && !existsSync(item.log)) return true;
  }
  return false;
}

function scrubFailureLog(item: FailureSummary): FailureSummary {
  if (!item.log) return { ...item };
  if (existsSync(item.log)) return { ...item };
  const { log: _gone, ...rest } = item;
  return rest;
}

function scrubStepLog(step: ReportStep): ReportStep {
  if (!step.log) return { ...step };
  if (existsSync(step.log)) return { ...step };
  const { log: _gone, ...rest } = step;
  return rest;
}

function suggestNext(last: RunReport, config: EvolvingConfig | null): string[] {
  const stageId = last.stage_id;
  if (config && stageId) {
    const agent = nearestPriorAgentStage(config, stageId);
    if (agent) {
      return [readCurrentStepAction(agent.id), `evolving run ${stageId}`];
    }
  }
  if (stageId) return [`evolving run ${stageId}`];
  return ["explain"];
}
