import { emitRun } from "./emit.ts";
import { buildRunReport, createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import type { EvolvingConfig, GateCommand, RunReport } from "./types.ts";

/** Run every workflow step with kind run (skip guidance). */
export async function runFinish(cwd: string, config: EvolvingConfig): Promise<RunReport> {
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps, report } = createReporter(cwd, stamp);

  const runs = config.workflow.filter((step) => step.kind === "run");
  for (const step of runs) {
    if (!step.command) continue;
    const cmd: GateCommand = {
      name: step.id,
      command: step.command,
      env: step.env,
    };
    report(step.id, [await runCommand(cmd)]);
  }

  return emitRun(
    cwd,
    buildRunReport({
      command: "finish",
      startedAt,
      failed,
      steps,
    }),
  );
}
