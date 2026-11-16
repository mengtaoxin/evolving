import type { EvolvingConfig, GateCommand } from "./types.ts";
import {
  changedPathsFromGit,
  invalidSuiteArgs,
  resolveSuiteIds,
  suiteIdsFromConfig,
} from "./detect.ts";
import { createReporter, timestamp } from "./report.ts";
import { createRunner, installSignalHandlers } from "./run.ts";

export async function runVerify(
  cwd: string,
  config: EvolvingConfig,
  args: readonly string[],
): Promise<number> {
  const checkOnly = args.includes("--check");
  const suiteArgs = args.filter((arg) => !arg.startsWith("--"));
  const suiteIds = suiteIdsFromConfig(config.gates.verify);
  const invalid = invalidSuiteArgs(suiteArgs, suiteIds);
  if (invalid.length > 0) {
    console.error(
      `Unknown argument(s): ${invalid.join(", ")}. Expected ${[...suiteIds, "all"].join(", ")}, --check, --e2e.`,
    );
    return 2;
  }

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
    });
  }

  if (!checkOnly) {
    const changed = changedPathsFromGit(cwd);
    const selected = resolveSuiteIds(config.gates.verify, suiteArgs, changed);
    if (selected.length === 0) {
      if (suiteArgs.length > 0) {
        console.log("– tests: skipped (selected suite(s) matched none)");
      } else {
        console.log("– tests: skipped (no matching changes; pass a suite id or all to force)");
      }
    }
    for (const id of selected) {
      const suite = config.gates.verify.suites[id];
      if (!suite?.command) continue;
      const step: GateCommand = {
        name: suite.name ?? id,
        command: suite.command,
        env: suite.env,
      };
      report(step.name ?? id, [await runCommand(step)]);
    }
    for (const step of config.gates.verify.always ?? []) {
      const result = await runCommand(step);
      report(step.name ?? step.command.join(" "), [result], {
        showOutputOnSuccess: step.showOutputOnSuccess === true,
      });
    }
  }

  const total = ((Date.now() - startedAt) / 1000).toFixed(1);
  const label = checkOnly ? "check" : "verify";
  if (failed.length === 0) {
    console.log(`✔ ${label} passed · ${total}s`);
    return 0;
  }
  console.log(`✘ ${label} failed: ${failed.join(", ")} · ${total}s`);
  return 1;
}
