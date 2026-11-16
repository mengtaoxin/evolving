import { writeFileSync } from "node:fs";
import type {
  OutputMode,
  ReportStep,
  RunCommandName,
  RunReport,
  StepResult,
  VerifyReportMeta,
} from "./types.ts";

const MAX_PRINTED_LINES = 40;

export function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `${day}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function outputPreview(output: string): string {
  const lines = output.split("\n");
  if (lines.length <= MAX_PRINTED_LINES) return output;
  return `${lines.slice(0, MAX_PRINTED_LINES).join("\n")}\n… ${lines.length - MAX_PRINTED_LINES} more lines`;
}

function logPathFor(name: string, stamp: string): string {
  return `/tmp/evolving-${name.replace(/[^\w-]+/g, "-")}-${stamp}.log`;
}

export function createReporter(
  stamp: string,
  mode: OutputMode = "human",
): {
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

  function printOutput(result: StepResult, log: string): void {
    const preview = outputPreview(result.output);
    for (const line of preview.split("\n")) console.log(`  ${line}`);
    console.log(`  Log: ${log}`);
  }

  function report(
    label: string,
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
    const seconds = Math.max(0, ...results.map((r) => r.seconds));
    const warnedMissing =
      onMissing === "warn" ? results.filter((r) => r.missingExecutable === true) : [];
    const bad = results.filter(
      (r) => r.code !== 0 && !(onMissing === "warn" && r.missingExecutable === true),
    );
    const noisy = showOutputOnSuccess ? results.filter((r) => r.code === 0 && r.output) : [];

    for (const result of results) {
      const isMissingWarn = onMissing === "warn" && result.missingExecutable === true;
      const isBad = result.code !== 0 && !isMissingWarn;
      const shouldCapture =
        isBad ||
        isMissingWarn ||
        (showOutputOnSuccess && result.code === 0 && !!result.output);
      const log = shouldCapture ? writeLog(result) : undefined;
      const step: ReportStep = {
        name: result.name,
        ok: !isBad,
        code: result.code,
        seconds: result.seconds,
        ...(fix && isBad ? { fix: [...fix] } : {}),
        ...(log ? { log } : {}),
        ...(result.output && (isBad || isMissingWarn || showOutputOnSuccess)
          ? { output_preview: outputPreview(result.output) }
          : {}),
        ...(result.missingExecutable ? { missing_executable: true } : {}),
      };
      steps.push(step);
    }

    if (mode === "json") {
      for (const result of bad) failed.push(result.name);
      return;
    }

    if (bad.length === 0 && warnedMissing.length === 0) {
      console.log(`✔ ${label} · ${seconds.toFixed(1)}s`);
    } else if (bad.length === 0 && warnedMissing.length > 0) {
      console.log(`⚠ ${label} · ${seconds.toFixed(1)}s`);
    }

    for (const result of warnedMissing) {
      const exe = result.name === label ? result.name : `${label} / ${result.name}`;
      console.log(
        `  warn: ${exe} not installed (missing executable); install it to enable this check`,
      );
      const log = logPathFor(result.name, stamp);
      if (result.output) printOutput(result, log);
    }

    for (const result of noisy) {
      console.log(`  ${result.name} warnings:`);
      printOutput(result, logPathFor(result.name, stamp));
    }
    for (const result of bad) {
      failed.push(result.name);
      console.log(`✘ ${result.name} · ${result.seconds.toFixed(1)}s`);
      printOutput(result, logPathFor(result.name, stamp));
      if (fix && fix.length > 0) {
        console.log(`  fix: ${fix.join(" ")}`);
      }
    }
  }

  return { failed, steps, report };
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
  const exit_code =
    input.exitCode ?? (input.failed.length === 0 ? 0 : 1);
  return {
    evolving: 1,
    command: input.command,
    ok: exit_code === 0,
    exit_code,
    seconds,
    steps: input.steps,
    failed: [...input.failed],
    ...(input.verify ? { verify: input.verify } : {}),
  };
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value));
}

export function printRunSummary(
  command: string,
  failed: readonly string[],
  seconds: number,
): void {
  if (failed.length === 0) {
    console.log(`✔ ${command} passed · ${seconds.toFixed(1)}s`);
  } else {
    console.log(`✘ ${command} failed: ${failed.join(", ")} · ${seconds.toFixed(1)}s`);
  }
}
