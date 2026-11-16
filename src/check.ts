import { emitRun } from "./emit.ts";
import {
  buildRunReport,
  createReporter,
  printRunSummary,
  timestamp,
} from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import type { EvolvingConfig, RunOptions, RunReport } from "./types.ts";

export async function runCheck(
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

  for (const step of config.gates.check) {
    const result = await runCommand(step);
    report(step.name ?? step.command.join(" "), [result], {
      showOutputOnSuccess: step.showOutputOnSuccess === true,
      fix: step.fix,
      onMissing: step.onMissing,
    });
  }

  const runReport = buildRunReport({
    command: "check",
    startedAt,
    failed,
    steps,
  });
  if (mode === "human") printRunSummary("check", failed, runReport.seconds);
  return emitRun(cwd, runReport, mode);
}
