import type { EvolvingConfig } from "./types.ts";
import { createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";

/** Run write-allowed `gates.prepare` steps (format / lint:fix). */
export async function runPrepare(cwd: string, config: EvolvingConfig): Promise<number> {
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const steps = config.gates.prepare;
  if (steps.length === 0) {
    console.log("– prepare: no steps");
    return 0;
  }

  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, report } = createReporter(stamp);

  for (const step of steps) {
    const result = await runCommand(step);
    report(step.name ?? step.command.join(" "), [result], {
      showOutputOnSuccess: step.showOutputOnSuccess === true,
    });
  }

  const total = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (failed.length === 0) {
    console.log(`✔ prepare passed · ${total}s`);
    return 0;
  }
  console.log(`✘ prepare failed: ${failed.join(", ")} · ${total}s`);
  return 1;
}
