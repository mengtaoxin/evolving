import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logsDir } from "./last-run.ts";
import type {
  FailureSummary,
  ReportStep,
  RunCommandName,
  RunReport,
  SelectionReportMeta,
  StepResult,
} from "./types.ts";

const MAX_PRINTED_LINES = 40;
/** Cap on-disk step logs so a runaway suite cannot fill the repo. */
export const MAX_LOG_BYTES = 2 * 1024 * 1024;
const ERROR_LINE_RE = /Error|FAIL|error:|✘/i;

export function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `${day}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Compact window for agents: prefer an Error/FAIL neighborhood; otherwise the
 * last N lines. Evolving chooses this slice — agents must not shell-truncate.
 */
export function outputPreview(output: string, maxLines = MAX_PRINTED_LINES): string {
  const lines = output.split("\n");
  if (lines.length <= maxLines) return output;

  const errorIndex = lines.findIndex((line) => ERROR_LINE_RE.test(line));
  if (errorIndex >= 0) {
    const half = Math.floor(maxLines / 2);
    let start = Math.max(0, errorIndex - half);
    let end = Math.min(lines.length, start + maxLines);
    start = Math.max(0, end - maxLines);
    const slice = lines.slice(start, end);
    const parts: string[] = [];
    if (start > 0) parts.push(`… ${start} earlier lines`);
    parts.push(...slice);
    if (end < lines.length) parts.push(`… ${lines.length - end} more lines`);
    return parts.join("\n");
  }

  const start = lines.length - maxLines;
  return `… ${start} earlier lines\n${lines.slice(start).join("\n")}`;
}

export function sanitizeLogName(name: string): string {
  return name.replace(/[^\w-]+/g, "-");
}

export function stepLogPath(cwd: string, name: string, stamp: string): string {
  return join(logsDir(cwd), `${stamp}-${sanitizeLogName(name)}.log`);
}

/** Write step output under .evolving/logs/; truncate with a marker when over cap. */
export function writeStepLog(cwd: string, name: string, stamp: string, output: string): string {
  const dir = logsDir(cwd);
  mkdirSync(dir, { recursive: true });
  const path = stepLogPath(cwd, name, stamp);
  const body = output.length > MAX_LOG_BYTES
    ? `${output.slice(0, MAX_LOG_BYTES)}\n\n[evolving] log truncated at ${MAX_LOG_BYTES} bytes; original length ${output.length}\n`
    : `${output}\n`;
  writeFileSync(path, body);
  return path;
}

export function createReporter(
  cwd: string,
  stamp: string,
): {
  failed: string[];
  steps: ReportStep[];
  report: (
    label: string,
    results: StepResult[],
    options?: {
      showOutputOnSuccess?: boolean;
      onMissing?: "warn";
    },
  ) => void;
} {
  const failed: string[] = [];
  const steps: ReportStep[] = [];

  function report(
    _label: string,
    results: StepResult[],
    {
      showOutputOnSuccess = false,
      onMissing,
    }: {
      showOutputOnSuccess?: boolean;
      onMissing?: "warn";
    } = {},
  ): void {
    for (const result of results) {
      const isMissingWarn = onMissing === "warn" && result.missingExecutable === true;
      const isBad = result.code !== 0 && !isMissingWarn;
      const log = writeStepLog(cwd, result.name, stamp, result.output);
      const attachPreview =
        !!result.output &&
        (isBad || isMissingWarn || (showOutputOnSuccess && result.code === 0));
      const step: ReportStep = {
        name: result.name,
        ok: !isBad,
        code: result.code,
        seconds: result.seconds,
        log,
        ...(attachPreview ? { output_preview: outputPreview(result.output) } : {}),
        ...(result.missingExecutable ? { missing_executable: true } : {}),
      };
      steps.push(step);
      if (isBad) failed.push(result.name);
    }
  }

  return { failed, steps, report };
}

export function buildFailureSummaries(
  failed: readonly string[],
  steps: readonly ReportStep[],
): FailureSummary[] {
  const byName = new Map(steps.map((s) => [s.name, s]));
  return failed.map((name) => {
    const step = byName.get(name);
    const summary: FailureSummary = { name };
    if (step?.log) summary.log = step.log;
    if (step?.output_preview) summary.output_preview = step.output_preview;
    return summary;
  });
}

export function buildRunReport(input: {
  command: RunCommandName;
  startedAt: number;
  failed: readonly string[];
  steps: readonly ReportStep[];
  selection?: SelectionReportMeta;
  stage_id?: string;
  exitCode?: number;
}): RunReport {
  const seconds = Number(((Date.now() - input.startedAt) / 1000).toFixed(1));
  const exit_code = input.exitCode ?? (input.failed.length === 0 ? 0 : 1);
  const failure = buildFailureSummaries(input.failed, input.steps);
  return {
    evolving: 1,
    command: input.command,
    ok: exit_code === 0,
    exit_code,
    seconds,
    steps: input.steps,
    failed: [...input.failed],
    failure,
    step_count: input.steps.length,
    passed_count: input.steps.filter((s) => s.ok).length,
    ...(input.stage_id ? { stage_id: input.stage_id } : {}),
    ...(input.selection ? { selection: input.selection } : {}),
  };
}

/** Compact stdout view for successful runs (disk keeps full report + step logs). */
export function slimSuccessReport(report: RunReport): Record<string, unknown> {
  return {
    evolving: report.evolving,
    command: report.command,
    ok: true,
    exit_code: report.exit_code,
    seconds: report.seconds,
    failed: [],
    failure: [],
    step_count: report.step_count ?? report.steps.length,
    passed_count: report.passed_count ?? report.steps.filter((s) => s.ok).length,
    ...(report.stage_id ? { stage_id: report.stage_id } : {}),
    ...(report.last_run_path ? { last_run_path: report.last_run_path } : {}),
    ...(report.selection ? { selection: report.selection } : {}),
    ...(report.finished_at ? { finished_at: report.finished_at } : {}),
    ...(report.cwd ? { cwd: report.cwd } : {}),
  };
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value));
}
