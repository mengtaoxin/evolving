import { spawn } from "node:child_process";
import type { GateCommand, StepResult } from "./types.ts";

export type ChildHandle = ReturnType<typeof spawn>;

function isMissingExecutable(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

export function createRunner(cwd: string): {
  children: Set<ChildHandle>;
  runCommand: (step: GateCommand) => Promise<StepResult>;
} {
  const children = new Set<ChildHandle>();

  function runCommand(step: GateCommand): Promise<StepResult> {
    const [executable, ...args] = step.command;
    if (!executable) {
      return Promise.resolve({
        name: step.name ?? "(empty)",
        code: 1,
        output: "[evolving] empty command",
        seconds: 0,
      });
    }
    const name = step.name ?? step.command.join(" ");
    const started = Date.now();
    return new Promise((done) => {
      let settled = false;
      const child = spawn(executable, args, {
        cwd,
        env: { ...process.env, ...step.env, NO_COLOR: "1", FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      children.add(child);
      let output = "";
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding("utf8");
        stream.on("data", (chunk: string) => {
          output += chunk;
        });
      }
      const finish = (code: number, missingExecutable = false) => {
        if (settled) return;
        settled = true;
        children.delete(child);
        done({
          name,
          code,
          output: output.trim(),
          seconds: (Date.now() - started) / 1000,
          ...(missingExecutable ? { missingExecutable: true } : {}),
        });
      };
      child.on("error", (err) => {
        output += `\n[evolving] failed to start ${executable}: ${err.message}`;
        finish(1, isMissingExecutable(err));
      });
      child.on("close", (code) => finish(code ?? 1));
    });
  }

  return { children, runCommand };
}

export function installSignalHandlers(children: Set<ChildHandle>): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      for (const child of children) child.kill(signal);
      process.exit(130);
    });
  }
}
