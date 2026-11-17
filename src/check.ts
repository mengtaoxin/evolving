import { emitRun } from "./emit.ts";
import { buildRunReport, createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import { checkSteps } from "./stages-access.ts";
import type { EvolvingConfig, RunReport } from "./types.ts";

/** Run verify.check only (read-only static gates). */
export async function runCheck(cwd: string, config: EvolvingConfig): Promise<RunReport> {
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps, report } = createReporter(cwd, stamp);

  for (const step of checkSteps(config)) {
    const result = await runCommand(step);
    report(step.name ?? step.command.join(" "), [result], {
      showOutputOnSuccess: step.showOutputOnSuccess === true,
      fix: step.fix,
      onMissing: step.onMissing,
    });
  }

  return emitRun(
    cwd,
    buildRunReport({
      command: "check",
      startedAt,
      failed,
      steps,
    }),
  );
}
