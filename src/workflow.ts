import type { EvolvingConfig } from "./types.ts";

export function printWorkflow(config: EvolvingConfig): void {
  console.log("evolving workflow");
  console.log("");
  for (const [index, step] of config.workflow.entries()) {
    const n = index + 1;
    const skip = step.skip_when ? ` (skip_when: ${step.skip_when})` : "";
    console.log(`${n}. [${step.kind}] ${step.id}${skip}`);
    if (step.summary) console.log(`   ${step.summary}`);
    if (step.refs && step.refs.length > 0) {
      console.log(`   refs: ${step.refs.join(", ")}`);
    }
    if (step.kind === "run" && step.command) {
      console.log(`   run: ${step.command.join(" ")}`);
    }
    console.log("");
  }

  console.log("gates.prepare (writes; run: evolving prepare)");
  if (config.gates.prepare.length === 0) {
    console.log("  (none)");
  } else {
    for (const step of config.gates.prepare) {
      const label = step.name ?? step.command.join(" ");
      console.log(`  - ${label}: ${step.command.join(" ")}`);
    }
  }
  console.log("");
}
