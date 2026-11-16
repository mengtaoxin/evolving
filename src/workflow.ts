import { AGENT_CONTRACT } from "./contract.ts";
import { printJson } from "./report.ts";
import type { EvolvingConfig, GateCommand, GateCommandView, WorkflowView } from "./types.ts";

export function buildWorkflowView(config: EvolvingConfig): WorkflowView {
  return {
    evolving: 1,
    command: "workflow",
    contract: AGENT_CONTRACT,
    workflow: config.workflow.map((step) => ({
      id: step.id,
      kind: step.kind,
      ...(step.summary !== undefined ? { summary: step.summary } : {}),
      ...(step.refs !== undefined ? { refs: step.refs } : {}),
      ...(step.skip_when !== undefined ? { skip_when: step.skip_when } : {}),
      ...(step.command !== undefined ? { command: step.command } : {}),
    })),
    gates: {
      prepare: config.gates.prepare.map(gateView),
      check: config.gates.check.map(gateView),
      verify: {
        detect: "git",
        suites: Object.fromEntries(
          Object.entries(config.gates.verify.suites).map(([id, suite]) => [
            id,
            {
              paths: suite.paths,
              ...(suite.command !== undefined ? { command: suite.command } : {}),
              ...(suite.also !== undefined ? { also: suite.also } : {}),
              ...(suite.name !== undefined ? { name: suite.name } : {}),
            },
          ]),
        ),
        always: (config.gates.verify.always ?? []).map(gateView),
      },
    },
  };
}

export function printWorkflow(config: EvolvingConfig, json = false): void {
  const view = buildWorkflowView(config);
  if (json) {
    printJson(view);
    return;
  }

  console.log("evolving workflow");
  console.log("");
  for (const [index, step] of view.workflow.entries()) {
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
  if (view.gates.prepare.length === 0) {
    console.log("  (none)");
  } else {
    for (const step of view.gates.prepare) {
      const label = step.name ?? step.command.join(" ");
      console.log(`  - ${label}: ${step.command.join(" ")}`);
    }
  }
  console.log("");
  console.log("contract: prepare → verify; guidance is agent-side; finish runs kind:run only");
  console.log("");
}

function gateView(step: GateCommand): GateCommandView {
  return {
    ...(step.name !== undefined ? { name: step.name } : {}),
    command: step.command,
    ...(step.fix !== undefined ? { fix: step.fix } : {}),
    ...(step.onMissing !== undefined ? { onMissing: step.onMissing } : {}),
    ...(step.showOutputOnSuccess !== undefined
      ? { showOutputOnSuccess: step.showOutputOnSuccess }
      : {}),
  };
}
