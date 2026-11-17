import {
  AGENT_IO_DO,
  AGENT_IO_DO_NOT,
  agentContractFor,
  agentContractText,
  SKIP_WHEN_VOCABULARY,
} from "./contract.ts";
import { printJson } from "./report.ts";
import { checkSteps, prepareSteps, verifyStage } from "./stages-access.ts";
import { buildStatus } from "./status.ts";
import type {
  EvolvingConfig,
  ExplainProjectSummary,
  ExplainReport,
  ExplainTopicId,
  ExplainTopicRef,
  GateCommand,
  StageView,
} from "./types.ts";

const AGENT_IO_DETAIL = {
  do: [...AGENT_IO_DO],
  do_not: [...AGENT_IO_DO_NOT],
} as const;

export const EXPLAIN_TOPICS: readonly ExplainTopicRef[] = [
  { id: "contract", summary: "Fixed agent protocol (after_edit, guidance, finish)" },
  { id: "prepare", summary: "Write-allowed prepare stage (format / lint:fix)" },
  { id: "check", summary: "verify.check subset — read-only static gates" },
  { id: "verify", summary: "check + git-selected suites + always" },
  { id: "finish", summary: "Run all non-guidance stages in order" },
  { id: "stages", summary: "Minimal timeline map (id+kind) — no panorama" },
  { id: "status", summary: "Resume / recover truncated view from .evolving/last-run.json + logs" },
  { id: "json", summary: "Quiet JSON stdout; full step text under .evolving/logs/" },
  { id: "guidance", summary: "Guidance id list — body via Read evolving.yml top-down" },
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
  const afterEdit = contract.after_edit.map((s) => `evolving ${s}`);
  return {
    evolving: 1,
    command: "explain",
    topic: "index",
    summary:
      "evolving is the sole agent protocol for this repo (not an agent runtime). Downstream docs should only point here — do not duplicate rules in AGENTS.md. Quiet JSON stdout: never pipe/head/tail/tee/less/jq — read the full object. Success is slim; failures include output_preview; full step text is on step.log under .evolving/logs/. If your view truncated output, evolving status --full then Read the log — do not re-run to re-read. After edits follow after_edit (prepare then verify). Index is a map + next first step — never a full stages detail dump (no CLI panorama).",
    ok: true,
    exit_code: 0,
    contract,
    topics: EXPLAIN_TOPICS,
    project,
    detail: {
      protocol_source: "evolving explain",
      do_not_duplicate_in_downstream_docs: true,
      after_edit: contract.after_edit,
      minimal_loop: afterEdit,
      on_failure: "evolving status",
      on_truncated_view: "evolving status --full, then Read step.log — never re-run only to re-read",
      never_pipe: true,
      drill_when: "first time using evolving, or when a specific machine topic is unclear",
      progressive:
        "index = map (stage_ids) + next first step → act top-down. Drill explain prepare|verify|check for machine detail. Guidance body: Read evolving.yml for the current step only. No CLI dumps the full timeline detail (not explain, not evolving stages).",
      no_panorama: true,
    },
    next,
    ...(configError ? { error: configError } : {}),
    how_to_run: [...afterEdit, "evolving status"],
  };
}

export function buildExplainTopic(
  topic: ExplainTopicId,
  config: EvolvingConfig | null,
): ExplainReport {
  const contract = agentContractFor(config);
  switch (topic) {
    case "contract":
      return topicBase(topic, config, {
        summary:
          "Stable protocol agents must follow. Sole source: evolving explain — do not restate in downstream docs.",
        detail: {
          contract,
          text: agentContractText(config),
          ...AGENT_IO_DETAIL,
        },
        how_to_run: ["evolving explain contract"],
        see_also: ["prepare", "verify", "guidance", "json"],
        text: agentContractText(config),
      });
    case "prepare":
      return topicBase(topic, config, {
        summary:
          "Write-allowed prepare stage. Run after edits, before verify. Prefer this over hand-editing format/lint.",
        detail: {
          writes: true,
          steps: config ? prepareSteps(config).map(gateDetail) : null,
          note: "check/verify never run these steps.",
        },
        how_to_run: ["evolving prepare"],
        see_also: ["check", "verify", "json"],
      });
    case "check":
      return topicBase(topic, config, {
        summary:
          "Read-only static gates nested under kind: verify (check ⊂ verify). On failure, use fix companions or evolving prepare.",
        detail: {
          readonly: true,
          nested_under: "verify.check",
          steps: config ? checkSteps(config).map(gateDetail) : null,
        },
        how_to_run: ["evolving check", "evolving verify --check"],
        see_also: ["prepare", "verify", "json"],
      });
    case "verify": {
      const gate = config ? verifyStage(config) : null;
      return topicBase(topic, config, {
        summary: "Runs check, then git-detected suites (or explicit ids), then always.",
        detail: {
          readonly: true,
          flow: ["check", "suites(git|args)", "always"],
          inclusion: "check ⊂ verify",
          suites: gate
            ? Object.fromEntries(
                Object.entries(gate.suites).map(([id, suite]) => [
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
          always: gate ? (gate.always ?? []).map(gateDetail) : null,
          args: {
            suites: gate ? Object.keys(gate.suites) : [],
            all: "run every suite",
            check: "static gates only (--check)",
          },
        },
        how_to_run: ["evolving verify", "evolving verify all", "evolving verify --check"],
        see_also: ["prepare", "check", "status", "json"],
      });
    }
    case "finish":
      return topicBase(topic, config, {
        summary:
          "Runs every non-guidance stage in order: prepare steps, full verify, then kind: run extras. Skips guidance by design.",
        detail: {
          machine_stages: config
            ? config.stages
                .filter((s) => s.kind !== "guidance")
                .map((s): StageView => ({ id: s.id, kind: s.kind }))
            : null,
          guidance_skipped: config
            ? config.stages.filter((s) => s.kind === "guidance").map((s) => s.id)
            : null,
        },
        how_to_run: ["evolving finish"],
        see_also: ["stages", "prepare", "verify", "guidance"],
      });
    case "stages": {
      const rows = config ? config.stages.map((s): StageView => ({ id: s.id, kind: s.kind })) : null;
      return topicBase(topic, config, {
        summary:
          "Minimal progressive map (id+kind + first). Not a detail dump — no summary/skip_when/refs/commands here. Work top-down; machine detail via explain prepare|verify|check; guidance via Read evolving.yml for the current step.",
        detail: {
          after_edit: config?.after_edit ?? null,
          stages: rows,
          first: rows?.[0] ?? null,
          no_panorama: true,
          guidance_body: "Read evolving.yml for the current guidance step only",
          machine_detail: "evolving explain prepare|check|verify",
        },
        how_to_run: ["evolving explain stages", "evolving stages"],
        see_also: ["guidance", "finish", "prepare", "verify"],
      });
    }
    case "status":
      return topicBase(topic, config, {
        summary:
          "Reads .evolving/last-run.json and suggests next. Also the recovery path when the agent view truncated a long run — do not re-run only to re-read output.",
        detail: {
          path: ".evolving/last-run.json",
          logs_dir: ".evolving/logs/",
          states: ["none", "ok", "failed"],
          default_json: "slim: state, failed, failure, last_run_path, next (no embedded last_run)",
          full: "status --full embeds last_run (each step.log points at .evolving/logs/)",
          on_truncated_view:
            "evolving status --full, then Read step.log — never head/tail evolving or re-run to re-read",
          always_next:
            "If verify.always failed, next is full verify (not selected_suites replay)",
        },
        how_to_run: ["evolving status", "evolving status --full"],
        see_also: ["json", "prepare", "verify"],
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
            "last_run_path",
            "verify",
            "fix",
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
        how_to_run: [
          "evolving explain",
          "evolving prepare",
          "evolving verify",
          "evolving status",
        ],
        see_also: ["status", "contract"],
      });
    case "guidance":
      return topicBase(topic, config, {
        summary:
          "kind: guidance stages and skip_when are for the agent. The CLI never executes or evaluates them. This topic lists ids only — read evolving.yml for the current step's summary/refs/skip_when.",
        detail: {
          skip_when_vocabulary: SKIP_WHEN_VOCABULARY,
          guidance_stage_ids: config
            ? config.stages.filter((s) => s.kind === "guidance").map((s) => s.id)
            : null,
          body: "Read evolving.yml for the current guidance step only — no CLI panorama",
        },
        how_to_run: ["evolving explain guidance"],
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
  const prepare = prepareSteps(config);
  const gate = verifyStage(config);
  return {
    stage_ids: config.stages.map((s) => s.id),
    after_edit: config.after_edit,
    suite_ids: Object.keys(gate.suites),
    has_prepare: prepare.length > 0,
    prepare_count: prepare.length,
    check_count: gate.check.length,
    always_count: (gate.always ?? []).length,
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
