import {
  AGENT_IO_DO,
  AGENT_IO_DO_NOT,
  agentContractFor,
  agentContractText,
  SKIP_WHEN_VOCABULARY,
  TAGS_VOCABULARY,
} from "./contract.ts";
import { printJson } from "./report.ts";
import { isAgentStage, isMachineStage, machineStages } from "./stages-access.ts";
import { buildStatus } from "./status.ts";
import type {
  EvolvingConfig,
  ExplainProjectSummary,
  ExplainReport,
  ExplainTopicId,
  ExplainTopicRef,
  StageCommand,
  StageView,
} from "./types.ts";
import { isRefOnlyCommand } from "./types.ts";

const AGENT_IO_DETAIL = {
  do: [...AGENT_IO_DO],
  do_not: [...AGENT_IO_DO_NOT],
} as const;

export const EXPLAIN_TOPICS: readonly ExplainTopicRef[] = [
  { id: "contract", summary: "Fixed agent protocol (ordered stages, run, finish, resume)" },
  { id: "run", summary: "Run one stage by id (commands + git select + command://)" },
  { id: "finish", summary: "Run all machine stages in document order" },
  { id: "stages", summary: "Minimal timeline map (id+runnable) — no panorama" },
  { id: "status", summary: "Resume / recover truncated view from .evolving/last-run.json + logs" },
  { id: "json", summary: "Quiet JSON stdout; full step text under .evolving/logs/" },
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
      "evolving is the sole agent protocol for this repo (not an agent runtime). Downstream docs should only point here — do not duplicate rules in AGENTS.md. Quiet JSON stdout: never pipe/head/tail/tee/less/jq — read the full object. Success is slim; failures include output_preview; full step text is on step.log under .evolving/logs/. If your view truncated output, evolving status --full then Read the log — do not re-run to re-read. Walk stages top-down; on failure status jumps to the nearest prior agent stage (typically edit). Index is a map + next first step — never a full stages detail dump (no CLI panorama).",
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
      on_truncated_view: "evolving status --full, then Read step.log — never re-run only to re-read",
      never_pipe: true,
      drill_when: "first time using evolving, or when a specific machine topic is unclear",
      progressive:
        "index = map (stage_ids) + next first step → act top-down. Drill explain run for machine detail. Agent body: Read evolving.yml for the current step only. No CLI dumps the full timeline detail (not explain, not evolving stages).",
      no_panorama: true,
    },
    next,
    ...(configError ? { error: configError } : {}),
    how_to_run: ["evolving stages", "evolving run <stage-id>", "evolving status"],
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
          "Run one stage: evolving run <stage-id> [command-id|all...]. Machine stages select always-on + git path matches, then expand command://. Agent stages return no commands to run.",
        detail: {
          stages: machines.map((s) => ({
            id: s.id,
            commands: s.commands.map(commandDetail),
          })),
          args: {
            stage_id: "required",
            command_ids: "optional subset or all",
          },
        },
        how_to_run: ["evolving run <stage-id>", "evolving run <stage-id> all"],
        see_also: ["finish", "status", "json"],
      });
    }
    case "finish":
      return topicBase(topic, config, {
        summary: "Runs every machine stage (has commands) in document order. Skips agent stages.",
        detail: {
          machine_stages: config
            ? machineStages(config).map((s): StageView => ({
                id: s.id,
                runnable: true,
              }))
            : null,
          agent_skipped: config
            ? config.stages.filter(isAgentStage).map((s) => s.id)
            : null,
        },
        how_to_run: ["evolving finish"],
        see_also: ["stages", "run", "agent"],
      });
    case "stages": {
      const rows = config
        ? config.stages.map(
            (s): StageView => ({ id: s.id, runnable: isMachineStage(s) }),
          )
        : null;
      return topicBase(topic, config, {
        summary:
          "Minimal progressive map (id+runnable + first). Not a detail dump — no summary/skip_when/refs/tags/commands here. Work top-down; machine detail via explain run; agent body via Read evolving.yml for the current step.",
        detail: {
          stages: rows,
          first: rows?.[0] ?? null,
          no_panorama: true,
          agent_body: "Read evolving.yml for the current agent step only",
          machine_detail: "evolving explain run",
        },
        how_to_run: ["evolving explain stages", "evolving stages"],
        see_also: ["agent", "finish", "run"],
      });
    }
    case "status":
      return topicBase(topic, config, {
        summary:
          "Reads .evolving/last-run.json and suggests next. On failure, next is the nearest prior agent stage (typically edit), then re-run. Also the recovery path when the agent view truncated a long run.",
        detail: {
          path: ".evolving/last-run.json",
          logs_dir: ".evolving/logs/",
          states: ["none", "ok", "failed"],
          default_json: "slim: state, failed, failure, last_run_path, next (no embedded last_run)",
          full: "status --full embeds last_run (each step.log points at .evolving/logs/)",
          on_truncated_view:
            "evolving status --full, then Read step.log — never head/tail evolving or re-run to re-read",
          resume_on_fail: "nearest prior agent stage (no commands)",
        },
        how_to_run: ["evolving status", "evolving status --full"],
        see_also: ["json", "run"],
      });
    case "json":
      return topicBase(topic, config, {
        summary:
          "stdout is always one quiet JSON object. Never pipe or second-truncate it. Full step text is under .evolving/logs/ (step.log on every step).",
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
            "Evolving-chosen window (Error/FAIL neighborhood, else last N lines) so you can locate the failure. Read step.log for the full text — do not shell-truncate.",
          step_log:
            "Every step writes .evolving/logs/<stamp>-<name>.log; path is always on step.log (success and failure).",
          success_json:
            "Compressed: ok, seconds, counts, last_run_path; failure[] empty. Disk keeps full last-run + logs.",
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
        how_to_run: ["evolving explain", "evolving run <stage-id>", "evolving status"],
        see_also: ["status", "contract"],
      });
    case "agent":
      return topicBase(topic, config, {
        summary:
          "Agent stages have no commands. The CLI never executes or evaluates skip_when or tags. This topic lists ids only — read evolving.yml for the current step's summary/refs/skip_when/tags. Place an edit stage where the agent should change code; optional tags like needs-agent clarify intent.",
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
            "Optional labels on any stage; recommended needs-agent. CLI does not enforce. Not shown in evolving stages map.",
        },
        how_to_run: ["evolving explain agent"],
        see_also: ["stages", "finish", "contract"],
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
      contract: agentContractFor(config),
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
      return ["status", ...status.next];
    }
  }
  if (!project) return ["explain contract"];
  if (project.first_stage_id) return [project.first_stage_id];
  return ["stages"];
}
