import { writeFileSync } from "node:fs";
import type { StepResult } from "./types.ts";

const MAX_PRINTED_LINES = 40;

export function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `${day}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function createReporter(stamp: string): {
  failed: string[];
  report: (
    label: string,
    results: StepResult[],
    options?: { showOutputOnSuccess?: boolean },
  ) => void;
} {
  const failed: string[] = [];

  function printOutput(result: StepResult): void {
    const lines = result.output.split("\n");
    for (const line of lines.slice(0, MAX_PRINTED_LINES)) console.log(`  ${line}`);
    if (lines.length > MAX_PRINTED_LINES) {
      console.log(`  … ${lines.length - MAX_PRINTED_LINES} more lines`);
    }
    const log = `/tmp/evolving-${result.name.replace(/[^\w-]+/g, "-")}-${stamp}.log`;
    writeFileSync(log, `${result.output}\n`);
    console.log(`  Log: ${log}`);
  }

  function report(
    label: string,
    results: StepResult[],
    { showOutputOnSuccess = false }: { showOutputOnSuccess?: boolean } = {},
  ): void {
    const seconds = Math.max(0, ...results.map((r) => r.seconds)).toFixed(1);
    const bad = results.filter((r) => r.code !== 0);
    const noisy = showOutputOnSuccess ? results.filter((r) => r.code === 0 && r.output) : [];
    if (bad.length === 0) console.log(`✔ ${label} · ${seconds}s`);
    for (const result of noisy) {
      console.log(`  ${result.name} warnings:`);
      printOutput(result);
    }
    for (const result of bad) {
      failed.push(result.name);
      console.log(`✘ ${result.name} · ${result.seconds.toFixed(1)}s`);
      printOutput(result);
    }
  }

  return { failed, report };
}
