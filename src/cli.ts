#!/usr/bin/env node
import { runCheck } from "./check.ts";
import { runFinish } from "./finish.ts";
import { printExplain, resolveExplain } from "./explain.ts";
import { loadConfig } from "./load-config.ts";
import { runPrepare } from "./prepare.ts";
import { printJson } from "./report.ts";
import { printStatus } from "./status.ts";
import { runVerify } from "./verify.ts";
import { printWorkflow } from "./workflow.ts";

const USAGE = `Usage:
  evolving explain [topic] [--config path]
  evolving workflow [--config path]
  evolving prepare [--config path]
  evolving check [--config path]
  evolving verify [suite|all...] [--check] [--e2e] [--config path]
  evolving finish [--config path]
  evolving status [--full] [--config path]
  evolving agent-contract   # alias: explain contract

For agents: evolving explain
prepare runs gates.prepare (may write). check and verify are read-only.
stdout is always one JSON object.
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
  const configFlag = takeFlagValue(rest, "--config");
  const full = takeFlag(rest, "--full");
  const cwd = process.cwd();

  if (command === "explain" || command === "agent-contract") {
    const topic = command === "agent-contract" ? "contract" : rest.find((a) => !a.startsWith("--"));
    if (command === "explain" && topic) {
      const index = rest.indexOf(topic);
      if (index !== -1) rest.splice(index, 1);
    }
    const { config, error } = tryLoadConfig(cwd, configFlag);
    const report = resolveExplain(topic, config, cwd, error);
    printExplain(report);
    process.exitCode = report.exit_code;
    return;
  }

  if (command === "status") {
    printStatus(cwd, { full });
    return;
  }

  let config;
  try {
    config = loadConfig(cwd, configFlag);
  } catch (err) {
    printJson({
      evolving: 1,
      ok: false,
      exit_code: 2,
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 2;
    return;
  }

  switch (command) {
    case "workflow":
      printWorkflow(config);
      return;
    case "prepare":
      process.exitCode = (await runPrepare(cwd, config)).exit_code;
      return;
    case "check":
      process.exitCode = (await runCheck(cwd, config)).exit_code;
      return;
    case "verify":
      process.exitCode = (await runVerify(cwd, config, rest)).exit_code;
      return;
    case "finish":
      process.exitCode = (await runFinish(cwd, config)).exit_code;
      return;
    default:
      console.error(`Unknown command: ${command}\n`);
      process.stdout.write(USAGE);
      process.exitCode = 2;
  }
}

function tryLoadConfig(
  cwd: string,
  configFlag?: string,
): { config: ReturnType<typeof loadConfig> | null; error?: string } {
  try {
    return { config: loadConfig(cwd, configFlag) };
  } catch (err) {
    return { config: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function takeFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  args.splice(index, value === undefined ? 1 : 2);
  return value;
}

await main();
