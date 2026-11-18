import {
  AGENT_IO_DO,
  AGENT_IO_DO_NOT,
  agentContractFor,
  agentContractText,
  SKIP_WHEN_VOCABULARY,
  TAGS_VOCABULARY,
} from "./contract.ts";
import { printJson } from "./report.ts";
import {
  findStage,
  isAgentStage,
  isMachineStage,
  machineStages,
  readCurrentStepAction,
} from "./stages-access.ts";
import { buildStatus } from "./status.ts";
import type {
  EvolvingConfig,
  ExplainProjectSummary,
  ExplainReport,
  ExplainTopicId,
  ExplainTopicRef,
  Stage,
  StageCommand,
  StageView,
} from "./types.ts";
import { isRefOnlyCommand } from "./types.ts";

const AGENT_IO_DETAIL = {
  do: [...AGENT_IO_DO],
  do_not: [...AGENT_IO_DO_NOT],
} as const;

export const EXPLAIN_TOPICS: readonly ExplainTopicRef[] = [
  { id: "contract", summary: "Fixed agent protocol (ordered stages, run, resume)" },
  { id: "run", summary: "Run by stage id, --tags, or --ids (commands + git select + command://)" },
  { id: "stages", summary: "Minimal timeline map (id+runnable) — no panorama" },
  { id: "status", summary: "Resume / recover truncated view from .evolving/last-run.json + OS tmp logs" },
  { id: "json", summary: "Quiet JSON stdout; full step text under OS tmp (step.log)" },
  { id: "agent", summary: "Agent stage ids — body via Read evolving.yml top-down" },
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
  const contract = agentContractFor(config);
  const project = config ? summarizeProject(config) : null;
  const next = suggestIndexNext(cwd, project);
  return {
    evolving: 1,
    command: "explain",
    topic: "index",
    summary:
      "evolving is the sole agent protocol for this repo (not an agent runtime). Downstream docs should only point here — do not duplicate rules in AGENTS.md. Quiet JSON stdout: never pipe/head/tail/tee/less/jq — read the full object. Success is slim; failures include output_preview; full step text is on step.log under OS tmp. If your view truncated output, evolving status --full then Read the log when present — do not re-run only to re-read. If status reports logs_missing, re-run. Walk stages top-down. next is an executable action, never a bare stage id: an agent step says Read evolving.yml for the current step. evolving explain <stage-id> returns that step's summary, refs, and skip_when only. Machine detail is evolving explain run, only before evolving run. Index is a map (stage_ids) + that next action — never a full stages detail dump (no CLI panorama).",
    ok: true,
    exit_code: 0,
    contract,
    topics: EXPLAIN_TOPICS,
    project,
    detail: {
      protocol_source: "evolving explain",
      do_not_duplicate_in_downstream_docs: true,
      stages_order: "document",
      on_failure: "evolving status",
      on_truncated_view:
        "evolving status --full, then Read step.log when present — never re-run only to re-read; if logs_missing, re-run",
      never_pipe: true,
      progressive:
        "index = map (stage_ids) + next action → act top-down. Machine detail only via evolving explain run, and only before evolving run. Agent body: Read evolving.yml for the current step only. No CLI dumps the full timeline detail (not explain, not evolving stages).",
      no_panorama: true,
    },
    next,
    ...(configError ? { error: configError } : {}),
    how_to_run: [
      "evolving run <stage-id>",
      "evolving run --tags <tags>",
      "evolving run --ids <ids>",
      "evolving status",
    ],
  };
}

export function buildExplainTopic(
  topic: ExplainTopicId,
  config: EvolvingConfig | null,
): ExplainReport {
  switch (topic) {
    case "contract":
      return topicBase(topic, config, {
        summary:
          "Stable protocol agents must follow. Sole source: evolving explain — do not restate in downstream docs.",
        detail: {
          contract: agentContractFor(config),
          text: agentContractText(config),
          ...AGENT_IO_DETAIL,
        },
        how_to_run: ["evolving explain contract"],
        see_also: ["run", "agent", "json"],
        text: agentContractText(config),
      });
    case "run": {
      const machines = config ? machineStages(config) : [];
      return topicBase(topic, config, {
        summary:
          "Run machine stages: evolving run <stage-id> [command-id|all...], evolving run --tags <tags>, or evolving run --ids <ids>. Modes are mutually exclusive. --tags selects machine stages with any listed tag (document order); --ids runs the listed ids in order (skips agent stages; unknown id fails). Per stage: always-on + git path select, then command://. Single agent stage id returns ok with no spawn.",
        detail: {
          stages: machines.map((s) => ({
            id: s.id,
            commands: s.commands.map(commandDetail),
            ...(s.tags ? { tags: s.tags } : {}),
          })),
          modes: {
            stage_id: "evolving run <stage-id> [command-id|all...]",
            tags: "evolving run --tags tag1,tag2 (OR match, machine only)",
            ids: "evolving run --ids id1,id2 (order given; skip agent; unknown fails)",
          },
          args: {
            stage_id: "one of: stage id, --tags, or --ids",
            command_ids: "optional subset or all (single-stage mode only)",
          },
        },
        how_to_run: [
          "evolving run <stage-id>",
          "evolving run <stage-id> all",
          "evolving run --tags <tags>",
          "evolving run --ids <ids>",
        ],
        see_also: ["status", "json", "agent"],
      });
    }
    case "stages": {
      const rows = config
        ? config.stages.map(
            (s): StageView => ({ id: s.id, runnable: isMachineStage(s) }),
          )
        : null;
      return topicBase(topic, config, {
        summary:
          "Minimal progressive map (id+runnable + first). Not a detail dump — no summary/skip_when/refs/tags/commands here. Work top-down; machine detail via evolving explain run only before evolving run; agent body via Read evolving.yml for the current step.",
        detail: {
          stages: rows,
          first: rows?.[0] ?? null,
          no_panorama: true,
          agent_body: "Read evolving.yml for the current agent step only",
          machine_detail: "evolving explain run",
        },
        how_to_run: ["evolving explain stages", "evolving stages"],
        see_also: ["agent", "run"],
      });
    }
    case "status":
      return topicBase(topic, config, {
        summary:
          "Reads .evolving/last-run.json and suggests next. On failure, next is the nearest prior agent stage (typically edit), then re-run. Also the recovery path when the agent view truncated a long run.",
        detail: {
          path: ".evolving/last-run.json",
          logs_dir: "OS tmp/evolving/ (session scratch; may be cleaned)",
          states: ["none", "ok", "failed"],
          default_json:
            "slim: state, failed, failure, last_run_path, next (no embedded last_run); logs_missing + logs_note when step.log is gone",
          full: "status --full embeds last_run (each step.log points at OS tmp when still present)",
          on_truncated_view:
            "evolving status --full, then Read step.log when present — never head/tail evolving or re-run only to re-read",
          on_logs_missing: "re-run the failed stage — do not Read a missing step.log path",
          resume_on_fail: "nearest prior agent stage (no commands)",
        },
        how_to_run: ["evolving status", "evolving status --full"],
        see_also: ["json", "run"],
      });
    case "json":
      return topicBase(topic, config, {
        summary:
          "stdout is always one quiet JSON object. Never pipe or second-truncate it. Full step text is under OS tmp (step.log on every step).",
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
            "stage_id",
            "last_run_path",
            "selection",
            "log",
            "output_preview",
          ],
          output_preview:
            "Evolving-chosen window (Error/FAIL neighborhood, else last N lines) so you can locate the failure. Read step.log for the full text when present — do not shell-truncate.",
          step_log:
            "Every step writes OS tmp/evolving/evolving-<stamp>-<name>-<random>.log; path is always on step.log (success and failure) while the file exists.",
          success_json:
            "Compressed: ok, seconds, counts, last_run_path; failure[] empty. Disk keeps full last-run; step logs live under OS tmp.",
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
          "evolving run <stage-id>",
          "evolving run --tags <tags>",
          "evolving run --ids <ids>",
          "evolving status",
        ],
        see_also: ["status", "contract"],
      });
    case "agent":
      return topicBase(topic, config, {
        summary:
          "Agent stages have no commands. The CLI never executes or evaluates skip_when. This topic lists ids only — read evolving.yml for the current step's summary/refs/skip_when/tags. Place an edit stage where the agent should change code; optional tags like needs-agent clarify intent. Other tags are consumer-defined; filter with evolving run --tags when useful.",
        detail: {
          skip_when_vocabulary: SKIP_WHEN_VOCABULARY,
          tags_vocabulary: TAGS_VOCABULARY,
          agent_stage_ids: config
            ? config.stages.filter(isAgentStage).map((s) => s.id)
            : null,
          body: "Read evolving.yml for the current agent step only (summary/refs/skip_when/tags) — no CLI panorama; stages map stays id+runnable",
          edit_checkpoint:
            "Put a no-commands stage (e.g. id: edit) before machine gates; status resumes there on failure",
          tags:
            "Optional labels; recommended needs-agent (semantic). Other tags are free text for run --tags. Not shown in evolving stages map.",
        },
        how_to_run: ["evolving explain agent"],
        see_also: ["stages", "run", "contract"],
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
  if (isExplainTopic(topic)) {
    const report = buildExplainTopic(topic, config);
    if (configError) return { ...report, error: configError };
    return report;
  }
  if (config) {
    const stage = findStage(config, topic);
    if (stage) {
      const report = buildExplainStage(stage, config);
      if (configError) return { ...report, error: configError };
      return report;
    }
  }
  return {
    evolving: 1,
    command: "explain",
    topic: "index",
    summary: `Unknown topic: ${topic}`,
    ok: false,
    exit_code: 2,
    contract: agentContractFor(config),
    topics: EXPLAIN_TOPICS,
    project: config ? summarizeProject(config) : null,
    error: `Unknown topic: ${topic}. Expected: ${EXPLAIN_TOPICS.map((t) => t.id).join(", ")}`,
    next: ["explain"],
  };
}

function buildExplainStage(stage: Stage, config: EvolvingConfig): ExplainReport {
  const agent = isAgentStage(stage);
  const step = stage.summary ?? stage.id;
  return {
    evolving: 1,
    command: "explain",
    topic: "stage",
    summary: agent
      ? `${step} — this step only (summary, refs, skip_when). Read evolving.yml for the current step.`
      : `${step} — this step only (summary, refs, skip_when). Machine commands are on evolving explain run, only before evolving run.`,
    ok: true,
    exit_code: 0,
    contract: agentContractFor(config),
    detail: {
      id: stage.id,
      summary: stage.summary ?? null,
      refs: stage.refs ? [...stage.refs] : null,
      skip_when: stage.skip_when ?? null,
    },
    next: agent
      ? [readCurrentStepAction(stage.id)]
      : ["evolving explain run", `evolving run ${stage.id}`],
  };
}

export function printExplain(report: ExplainReport): void {
  printJson(report);
}

function topicBase(
  topic: ExplainTopicId,
  config: EvolvingConfig | null,
  fields: {
    summary: string;
    detail?: unknown;
    how_to_run?: readonly string[];
    see_also?: readonly ExplainTopicId[];
    text?: string;
  },
): ExplainReport {
  return {
    evolving: 1,
    command: "explain",
    topic,
    summary: fields.summary,
    ok: true,
    exit_code: 0,
    contract: agentContractFor(config),
    ...(fields.detail !== undefined ? { detail: fields.detail } : {}),
    ...(fields.how_to_run ? { how_to_run: fields.how_to_run } : {}),
    ...(fields.see_also ? { see_also: fields.see_also } : {}),
    ...(fields.text ? { text: fields.text } : {}),
  };
}

function summarizeProject(config: EvolvingConfig): ExplainProjectSummary {
  const agent_stage_ids = config.stages.filter(isAgentStage).map((s) => s.id);
  const machine_stage_ids = machineStages(config).map((s) => s.id);
  return {
    stage_ids: config.stages.map((s) => s.id),
    agent_stage_ids,
    machine_stage_ids,
    first_stage_id: config.stages[0]?.id ?? null,
    first_machine_stage_id: machine_stage_ids[0] ?? null,
  };
}

function commandDetail(cmd: StageCommand): Record<string, unknown> {
  return {
    id: cmd.id,
    name: cmd.name,
    command: cmd.command,
    ...(cmd.run_in_file_change ? { run_in_file_change: cmd.run_in_file_change } : {}),
    ...(isRefOnlyCommand(cmd.command) ? { composition: true } : {}),
    ...(cmd.onMissing ? { onMissing: cmd.onMissing } : {}),
  };
}

function suggestIndexNext(
  cwd: string | undefined,
  project: ExplainProjectSummary | null,
): string[] {
  if (cwd) {
    const status = buildStatus(cwd);
    if (status.state === "failed" && status.next.length > 0) {
      return ["evolving status", ...status.next];
    }
  }
  if (!project) return ["evolving explain contract"];
  const first = project.first_stage_id;
  if (!first) return ["Read evolving.yml"];
  if (project.agent_stage_ids.includes(first)) return [readCurrentStepAction(first)];
  return ["evolving explain run", `evolving run ${first}`];
}
