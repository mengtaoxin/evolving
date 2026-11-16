import {
  AGENT_CONTRACT,
  AGENT_IO_DO,
  AGENT_IO_DO_NOT,
  agentContractText,
  SKIP_WHEN_VOCABULARY,
} from "./contract.ts";
import { printJson } from "./report.ts";
import { buildStatus } from "./status.ts";
import type {
  EvolvingConfig,
  ExplainProjectSummary,
  ExplainReport,
  ExplainTopicId,
  ExplainTopicRef,
  GateCommand,
} from "./types.ts";

const AGENT_IO_DETAIL = {
  do: [...AGENT_IO_DO],
  do_not: [...AGENT_IO_DO_NOT],
} as const;

export const EXPLAIN_TOPICS: readonly ExplainTopicRef[] = [
  { id: "contract", summary: "Fixed agent protocol (order, guidance, finish)" },
  { id: "prepare", summary: "Write-allowed gates (format / lint:fix)" },
  { id: "check", summary: "Read-only static gates and fix companions" },
  { id: "verify", summary: "check + git-selected suites + always" },
  { id: "finish", summary: "Run workflow kind:run steps only" },
  { id: "workflow", summary: "This repo checklist (guidance + run)" },
  { id: "status", summary: "Resume from .evolving/last-run.json" },
  { id: "json", summary: "RunReport / JSON stdout shape for agents" },
  { id: "guidance", summary: "Agent-evaluated skip_when / guidance steps" },
];

const TOPIC_IDS = new Set(EXPLAIN_TOPICS.map((t) => t.id));

export function isExplainTopic(value: string): value is ExplainTopicId {
  return TOPIC_IDS.has(value as ExplainTopicId);
}

export function buildExplainIndex(
  config: EvolvingConfig | null,
  cwd?: string,
  configError?: string,
): ExplainReport {
  const project = config ? summarizeProject(config) : null;
  const next = suggestIndexNext(cwd, project);
  return {
    evolving: 1,
    command: "explain",
    topic: "index",
    summary:
      "evolving is a project-agnostic change-finish gate runner and checklist. It is not an agent runtime. Default loop: prepare then verify; drill a topic only when first using evolving or unclear.",
    ok: true,
    exit_code: 0,
    contract: AGENT_CONTRACT,
    topics: EXPLAIN_TOPICS,
    project,
    detail: {
      minimal_loop: ["evolving prepare", "evolving verify"],
      on_failure: "evolving status",
      drill_when: "first time using evolving, or when a specific topic is unclear",
    },
    next,
    ...(configError ? { error: configError } : {}),
    how_to_run: ["evolving prepare", "evolving verify", "evolving status"],
  };
}

export function buildExplainTopic(
  topic: ExplainTopicId,
  config: EvolvingConfig | null,
): ExplainReport {
  switch (topic) {
    case "contract":
      return topicBase(topic, {
        summary: "Stable protocol agents must follow for this package.",
        detail: {
          contract: AGENT_CONTRACT,
          text: agentContractText(),
          ...AGENT_IO_DETAIL,
        },
        how_to_run: ["evolving explain contract"],
        see_also: ["prepare", "verify", "guidance", "json"],
        text: agentContractText(),
      });
    case "prepare":
      return topicBase(topic, {
        summary:
          "Write-allowed gates. Run after edits, before verify. Prefer this over hand-editing format/lint.",
        detail: {
          writes: true,
          steps: config ? config.gates.prepare.map(gateDetail) : null,
          note: "check/verify never run these steps.",
        },
        how_to_run: ["evolving prepare"],
        see_also: ["check", "verify", "json"],
      });
    case "check":
      return topicBase(topic, {
        summary: "Read-only static gates. On failure, use fix companions or evolving prepare.",
        detail: {
          readonly: true,
          steps: config ? config.gates.check.map(gateDetail) : null,
        },
        how_to_run: ["evolving check", "evolving verify --check"],
        see_also: ["prepare", "verify", "json"],
      });
    case "verify":
      return topicBase(topic, {
        summary: "Runs check, then git-detected suites (or explicit ids), then always.",
        detail: {
          readonly: true,
          flow: ["check", "suites(git|args)", "always"],
          suites: config
            ? Object.fromEntries(
                Object.entries(config.gates.verify.suites).map(([id, suite]) => [
                  id,
                  {
                    paths: suite.paths,
                    ...(suite.command ? { command: suite.command } : {}),
                    ...(suite.also ? { also: suite.also } : {}),
                    ...(suite.name ? { name: suite.name } : {}),
                  },
                ]),
              )
            : null,
          always: config ? (config.gates.verify.always ?? []).map(gateDetail) : null,
          args: {
            suites: config ? Object.keys(config.gates.verify.suites) : [],
            all: "run every suite",
            check: "static gates only (--check)",
          },
        },
        how_to_run: ["evolving verify", "evolving verify all", "evolving verify --check"],
        see_also: ["prepare", "check", "status", "json"],
      });
    case "finish":
      return topicBase(topic, {
        summary:
          "Runs every workflow step with kind: run; skips guidance by design. Put prepare+verify as run steps so finish matches prepare → verify.",
        detail: {
          run_steps: config
            ? config.workflow
                .filter((s) => s.kind === "run")
                .map((s) => ({ id: s.id, command: s.command }))
            : null,
          guidance_skipped: config
            ? config.workflow.filter((s) => s.kind === "guidance").map((s) => s.id)
            : null,
        },
        how_to_run: ["evolving finish"],
        see_also: ["workflow", "prepare", "verify", "guidance"],
      });
    case "workflow":
      return topicBase(topic, {
        summary:
          "Repo checklist. Guidance is agent-evaluated; run steps are what finish executes. For a full snapshot use evolving workflow.",
        detail: {
          steps: config
            ? config.workflow.map((s) => ({
                id: s.id,
                kind: s.kind,
                ...(s.summary ? { summary: s.summary } : {}),
                ...(s.skip_when ? { skip_when: s.skip_when } : {}),
                ...(s.refs ? { refs: s.refs } : {}),
                ...(s.command ? { command: s.command } : {}),
              }))
            : null,
          prepare_gate_names: config
            ? config.gates.prepare.map((s) => s.name ?? s.command.join(" "))
            : null,
        },
        how_to_run: ["evolving workflow", "evolving explain workflow"],
        see_also: ["guidance", "finish", "prepare", "verify"],
      });
    case "status":
      return topicBase(topic, {
        summary: "Reads .evolving/last-run.json and suggests next after a failed or interrupted run.",
        detail: {
          path: ".evolving/last-run.json",
          states: ["none", "ok", "failed"],
          default_json: "slim: state, failed, failure, last_run_path, next (no embedded last_run)",
          full: "status --full embeds last_run",
          always_next:
            "If gates.verify.always failed, next is full verify (not selected_suites replay)",
        },
        how_to_run: ["evolving status", "evolving status --full"],
        see_also: ["json", "prepare", "verify"],
      });
    case "json":
      return topicBase(topic, {
        summary:
          "stdout is always one JSON object; full logs stay in step.log.",
        detail: {
          ...AGENT_IO_DETAIL,
          run_report_fields: [
            "evolving",
            "command",
            "ok",
            "exit_code",
            "seconds",
            "steps",
            "failed",
            "failure",
            "last_run_path",
            "verify",
            "fix",
            "log",
            "output_preview",
          ],
          output_preview:
            "Enough to locate the error (tail or Error/FAIL window). Read step.log for full text.",
          success_json: "Compressed: ok, seconds, counts, last_run_path; failure[] empty",
          explain_fields: [
            "topic",
            "summary",
            "project",
            "detail",
            "how_to_run",
            "see_also",
            "next",
          ],
        },
        how_to_run: [
          "evolving explain",
          "evolving prepare",
          "evolving verify",
          "evolving status",
        ],
        see_also: ["status", "contract"],
      });
    case "guidance":
      return topicBase(topic, {
        summary:
          "kind: guidance steps and skip_when are for the agent. The CLI never executes or evaluates them.",
        detail: {
          skip_when_vocabulary: SKIP_WHEN_VOCABULARY,
          guidance_steps: config
            ? config.workflow
                .filter((s) => s.kind === "guidance")
                .map((s) => ({
                  id: s.id,
                  ...(s.summary ? { summary: s.summary } : {}),
                  ...(s.skip_when ? { skip_when: s.skip_when } : {}),
                  ...(s.refs ? { refs: s.refs } : {}),
                }))
            : null,
        },
        how_to_run: ["evolving explain guidance", "evolving explain workflow"],
        see_also: ["workflow", "finish", "contract"],
      });
  }
}

export function resolveExplain(
  topic: string | undefined,
  config: EvolvingConfig | null,
  cwd?: string,
  configError?: string,
): ExplainReport {
  if (!topic) return buildExplainIndex(config, cwd, configError);
  if (!isExplainTopic(topic)) {
    return {
      evolving: 1,
      command: "explain",
      topic: "index",
      summary: `Unknown topic: ${topic}`,
      ok: false,
      exit_code: 2,
      contract: AGENT_CONTRACT,
      topics: EXPLAIN_TOPICS,
      project: config ? summarizeProject(config) : null,
      error: `Unknown topic: ${topic}. Expected: ${EXPLAIN_TOPICS.map((t) => t.id).join(", ")}`,
      next: ["explain"],
    };
  }
  const report = buildExplainTopic(topic, config);
  if (configError) return { ...report, error: configError };
  return report;
}

export function printExplain(report: ExplainReport): void {
  printJson(report);
}

function topicBase(
  topic: ExplainTopicId,
  fields: {
    summary: string;
    detail?: unknown;
    how_to_run?: readonly string[];
    see_also?: readonly ExplainTopicId[];
    text?: string;
    contract_note?: string;
  },
): ExplainReport {
  return {
    evolving: 1,
    command: "explain",
    topic,
    summary: fields.summary,
    ok: true,
    exit_code: 0,
    contract: AGENT_CONTRACT,
    ...(fields.detail !== undefined ? { detail: fields.detail } : {}),
    ...(fields.how_to_run ? { how_to_run: fields.how_to_run } : {}),
    ...(fields.see_also ? { see_also: fields.see_also } : {}),
    ...(fields.text ? { text: fields.text } : {}),
  };
}

function summarizeProject(config: EvolvingConfig): ExplainProjectSummary {
  const workflow_ids = config.workflow.map((s) => s.id);
  const workflow_run_ids = config.workflow.filter((s) => s.kind === "run").map((s) => s.id);
  const workflow_guidance_ids = config.workflow
    .filter((s) => s.kind === "guidance")
    .map((s) => s.id);
  return {
    workflow_ids,
    workflow_run_ids,
    workflow_guidance_ids,
    suite_ids: Object.keys(config.gates.verify.suites),
    has_prepare: config.gates.prepare.length > 0,
    prepare_count: config.gates.prepare.length,
    check_count: config.gates.check.length,
    always_count: (config.gates.verify.always ?? []).length,
  };
}

function gateDetail(step: GateCommand): Record<string, unknown> {
  return {
    ...(step.name ? { name: step.name } : {}),
    command: step.command,
    ...(step.fix ? { fix: step.fix } : {}),
    ...(step.onMissing ? { onMissing: step.onMissing } : {}),
  };
}

function suggestIndexNext(cwd: string | undefined, project: ExplainProjectSummary | null): string[] {
  if (cwd) {
    const status = buildStatus(cwd);
    if (status.state === "failed" && status.next.length > 0) {
      return ["status", ...status.next];
    }
  }
  if (!project) return ["explain contract"];
  if (project.has_prepare) return ["prepare"];
  return ["verify"];
}
