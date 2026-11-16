#!/usr/bin/env node
import { loadConfig } from "./load-config.ts";
import { runCheck } from "./check.ts";
import { runVerify } from "./verify.ts";
import { printWorkflow } from "./workflow.ts";
import { runFinish } from "./finish.ts";

const USAGE = `Usage:
  evolving workflow [--config path]
  evolving check [--config path]
  evolving verify [suite|all...] [--check] [--e2e] [--config path]
  evolving finish [--config path]

Reads evolving.yml from the current working directory (or --config).
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(USAGE);
    process.exitCode = argv.length === 0 ? 2 : 0;
    return;
  }

  const command = argv[0] as string;
  const rest = argv.slice(1);
  const configFlag = takeConfigPath(rest);
  const cwd = process.cwd();

  let config;
  try {
    config = loadConfig(cwd, configFlag);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 2;
    return;
  }

  switch (command) {
    case "workflow":
      printWorkflow(config);
      return;
    case "check":
      process.exitCode = await runCheck(cwd, config);
      return;
    case "verify":
      process.exitCode = await runVerify(cwd, config, rest);
      return;
    case "finish":
      process.exitCode = await runFinish(cwd, config);
      return;
    default:
      console.error(`Unknown command: ${command}\n`);
      process.stdout.write(USAGE);
      process.exitCode = 2;
  }
}

function takeConfigPath(args: string[]): string | undefined {
  const index = args.indexOf("--config");
  if (index === -1) return undefined;
  const value = args[index + 1];
  args.splice(index, value === undefined ? 1 : 2);
  return value;
}

await main();
