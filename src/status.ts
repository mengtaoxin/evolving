import { loadConfig } from "./load-config.ts";
import { lastRunPath, readLastRun } from "./last-run.ts";
import { buildFailureSummaries, printJson } from "./report.ts";
import { nearestPriorAgentStage } from "./stages-access.ts";
import type { EvolvingConfig, FailureSummary, RunReport, StatusReport } from "./types.ts";

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

  const config = options.config === undefined ? tryConfig(cwd) : options.config;

  return {
    evolving: 1,
    command: "status",
    state: "failed",
    ok: false,
    failed: [...last.failed],
    failure,
    last_run_path: path,
    ...(full ? { last_run: last } : {}),
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

function suggestNext(last: RunReport, config: EvolvingConfig | null): string[] {
  const stageId = last.stage_id;
  if (config && stageId) {
    const agent = nearestPriorAgentStage(config, stageId);
    if (agent) {
      return [agent.id, `run ${stageId}`];
    }
  }
  if (stageId) return [`run ${stageId}`];
  return ["explain"];
}
