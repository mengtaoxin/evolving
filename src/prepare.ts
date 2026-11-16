import { emitRun } from "./emit.ts";
import {
  buildRunReport,
  createReporter,
  printRunSummary,
  timestamp,
} from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import type { EvolvingConfig, RunOptions, RunReport } from "./types.ts";

/** Run write-allowed `gates.prepare` steps (format / lint:fix). */
export async function runPrepare(
  cwd: string,
  config: EvolvingConfig,
  options: RunOptions = {},
): Promise<RunReport> {
  const mode = options.mode ?? "human";
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const steps = config.gates.prepare;

  if (steps.length === 0) {
    if (mode === "human") console.log("– prepare: no steps");
    return emitRun(
      cwd,
      buildRunReport({ command: "prepare", startedAt, failed: [], steps: [] }),
      mode,
    );
  }

  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps: reported, report } = createReporter(stamp, mode);

  for (const step of steps) {
    const result = await runCommand(step);
    report(step.name ?? step.command.join(" "), [result], {
      showOutputOnSuccess: step.showOutputOnSuccess === true,
      onMissing: step.onMissing,
    });
  }

  const runReport = buildRunReport({
    command: "prepare",
    startedAt,
    failed,
    steps: reported,
  });
  if (mode === "human") printRunSummary("prepare", failed, runReport.seconds);
  return emitRun(cwd, runReport, mode);
}
