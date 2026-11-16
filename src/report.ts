import { writeFileSync } from "node:fs";
import type {
  FailureSummary,
  ReportStep,
  RunCommandName,
  RunReport,
  StepResult,
  VerifyReportMeta,
} from "./types.ts";

const MAX_PRINTED_LINES = 40;
const ERROR_LINE_RE = /Error|FAIL|error:|✘/i;

export function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `${day}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Prefer error window or tail when output is long; head only if short enough. */
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

function logPathFor(name: string, stamp: string): string {
  return `/tmp/evolving-${name.replace(/[^\w-]+/g, "-")}-${stamp}.log`;
}

export function createReporter(stamp: string): {
  failed: string[];
  steps: ReportStep[];
  report: (
    label: string,
    results: StepResult[],
    options?: {
      showOutputOnSuccess?: boolean;
      fix?: readonly string[];
      onMissing?: "warn";
    },
  ) => void;
} {
  const failed: string[] = [];
  const steps: ReportStep[] = [];

  function writeLog(result: StepResult): string {
    const log = logPathFor(result.name, stamp);
    writeFileSync(log, `${result.output}\n`);
    return log;
  }

  function report(
    _label: string,
    results: StepResult[],
    {
      showOutputOnSuccess = false,
      fix,
      onMissing,
    }: {
      showOutputOnSuccess?: boolean;
      fix?: readonly string[];
      onMissing?: "warn";
    } = {},
  ): void {
    for (const result of results) {
      const isMissingWarn = onMissing === "warn" && result.missingExecutable === true;
      const isBad = result.code !== 0 && !isMissingWarn;
      const shouldCapture =
        isBad ||
        isMissingWarn ||
        (showOutputOnSuccess && result.code === 0 && !!result.output);
      const log = shouldCapture ? writeLog(result) : undefined;
      const attachPreview =
        result.output &&
        (isBad || isMissingWarn || (showOutputOnSuccess && result.code === 0));
      const step: ReportStep = {
        name: result.name,
        ok: !isBad,
        code: result.code,
        seconds: result.seconds,
        ...(fix && isBad ? { fix: [...fix] } : {}),
        ...(log ? { log } : {}),
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
    if (step?.fix) summary.fix = [...step.fix];
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
  verify?: VerifyReportMeta;
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
    ...(input.verify ? { verify: input.verify } : {}),
  };
}

/** Compact stdout view for successful runs (disk keeps full report). */
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
    ...(report.last_run_path ? { last_run_path: report.last_run_path } : {}),
    ...(report.verify ? { verify: report.verify } : {}),
    ...(report.finished_at ? { finished_at: report.finished_at } : {}),
    ...(report.cwd ? { cwd: report.cwd } : {}),
  };
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value));
}
