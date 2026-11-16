import { emitRun } from "./emit.ts";
import {
  buildRunReport,
  createReporter,
  printRunSummary,
  timestamp,
} from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import type { EvolvingConfig, GateCommand, RunOptions, RunReport } from "./types.ts";

/** Run every workflow step with kind run (skip guidance). */
export async function runFinish(
  cwd: string,
  config: EvolvingConfig,
  options: RunOptions = {},
): Promise<RunReport> {
  const mode = options.mode ?? "human";
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps, report } = createReporter(stamp, mode);

  const runs = config.workflow.filter((step) => step.kind === "run");
  if (runs.length === 0 && mode === "human") {
    console.log("– finish: no kind:run steps in workflow");
  }
  for (const step of runs) {
    if (!step.command) continue;
    const cmd: GateCommand = {
      name: step.id,
      command: step.command,
      env: step.env,
    };
    report(step.id, [await runCommand(cmd)]);
  }

  const runReport = buildRunReport({
    command: "finish",
    startedAt,
    failed,
    steps,
  });
  if (mode === "human") printRunSummary("finish", failed, runReport.seconds);
  return emitRun(cwd, runReport, mode);
}
