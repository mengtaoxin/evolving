import type { EvolvingConfig } from "./types.ts";
import { createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";

export async function runCheck(cwd: string, config: EvolvingConfig): Promise<number> {
  const stamp = timestamp(new Date());
  const startedAt = Date.now();
  const { children, runCommand } = createRunner(cwd);
  installSignalHandlers(children);
  const { failed, report } = createReporter(stamp);

  for (const step of config.gates.check) {
    const result = await runCommand(step);
    report(step.name ?? step.command.join(" "), [result], {
      showOutputOnSuccess: step.showOutputOnSuccess === true,
      fix: step.fix,
      onMissing: step.onMissing,
    });
  }

  const total = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (failed.length === 0) {
    console.log(`✔ check passed · ${total}s`);
    return 0;
  }
  console.log(`✘ check failed: ${failed.join(", ")} · ${total}s`);
  return 1;
}
