import type { EvolvingConfig, RunReport } from "./types.ts";
import { emitRun } from "./emit.ts";
import { buildRunReport, createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";
import { prepareCommands } from "./stages-access.ts";

/** Run write-allowed prepare stage commands (format / lint:fix). */
export async function runPrepare(cwd: string, config: EvolvingConfig): Promise<RunReport> {
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, steps, report } = createReporter(cwd, stamp);

  for (const step of prepareCommands(config)) {
    const result = await runCommand(step);
    report(step.name ?? step.command.join(" "), [result], {
      showOutputOnSuccess: step.showOutputOnSuccess === true,
      onMissing: step.onMissing,
    });
  }

  return emitRun(
    cwd,
    buildRunReport({
      command: "prepare",
      startedAt,
      failed,
      steps,
    }),
  );
}
