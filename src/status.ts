import { readLastRun } from "./last-run.ts";
import { printJson } from "./report.ts";
import type { RunReport, StatusReport } from "./types.ts";

export function buildStatus(cwd: string): StatusReport {
  const last = readLastRun(cwd);
  if (!last) {
    return {
      evolving: 1,
      command: "status",
      state: "none",
      ok: null,
      next: ["explain"],
    };
  }
  if (last.ok) {
    return {
      evolving: 1,
      command: "status",
      state: "ok",
      ok: true,
      last_run: last,
      next: [],
    };
  }
  return {
    evolving: 1,
    command: "status",
    state: "failed",
    ok: false,
    last_run: last,
    next: suggestNext(last),
  };
}

export function printStatus(cwd: string, json: boolean): StatusReport {
  const status = buildStatus(cwd);
  if (json) {
    printJson(status);
    return status;
  }
  if (status.state === "none") {
    console.log("evolving status: no last-run (run prepare/check/verify/finish first)");
    console.log("next: evolving explain");
    return status;
  }
  const last = status.last_run as RunReport;
  console.log(`evolving status: ${status.state} (last command: ${last.command})`);
  console.log(`  ok: ${last.ok}  exit_code: ${last.exit_code}  seconds: ${last.seconds}`);
  if (last.failed.length > 0) {
    console.log(`  failed: ${last.failed.join(", ")}`);
  }
  for (const step of last.steps) {
    if (!step.ok || step.fix) {
      const bits = [`${step.ok ? "ok" : "fail"} ${step.name}`];
      if (step.fix) bits.push(`fix: ${step.fix.join(" ")}`);
      if (step.log) bits.push(`log: ${step.log}`);
      console.log(`  - ${bits.join(" · ")}`);
    }
  }
  if (status.next.length > 0) {
    console.log(`next: evolving ${status.next.join(" ")}`);
  } else {
    console.log("next: (none)");
  }
  return status;
}

function suggestNext(last: RunReport): string[] {
  const failedSteps = last.steps.filter((s) => !s.ok);
  const withFix = failedSteps.filter((s) => s.fix && s.fix.length > 0);
  if (withFix.length > 0 || last.command === "prepare") {
    if (last.command === "prepare") return ["prepare"];
    return ["prepare", last.command, ...verifySuiteArgs(last)];
  }
  if (last.command === "verify") {
    return ["verify", ...verifySuiteArgs(last)];
  }
  return [last.command];
}

function verifySuiteArgs(last: RunReport): string[] {
  if (last.command !== "verify" || !last.verify) return [];
  if (last.verify.check_only) return ["--check"];
  return [...last.verify.selected_suites];
}
