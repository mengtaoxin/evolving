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

export function printWorkflow(config: EvolvingConfig): void {
  printJson(buildWorkflowView(config));
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
