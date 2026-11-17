/** A single shell invocation declared under a stage's commands. */
export interface StageCommand {
  id: string;
  name: string;
  /** argv: first element is the executable, or only command://id refs. */
  command: readonly string[];
  /** Git path patterns; omit to always run this command. */
  run_in_file_change?: readonly string[];
  env?: Readonly<Record<string, string>>;
  /** When true, non-empty stdout/stderr is printed even on success. */
  showOutputOnSuccess?: boolean;
  /**
   * When the executable is not on PATH (`spawn` ENOENT): `warn` prints a
   * reminder and does not fail the gate. Other non-zero exits still fail.
   */
  onMissing?: "warn";
}

/**
 * One checklist node. Document order is the protocol axis.
 * - Has `commands` → machine stage (CLI can run).
 * - No `commands` → agent stage (read summary/refs/tags; CLI does not spawn).
 */
export interface Stage {
  id: string;
  summary?: string;
  refs?: readonly string[];
  /** Documentation-only skip hint for agents; the CLI never evaluates it. */
  skip_when?: string;
  /**
   * Optional labels. Recommended: needs-agent (semantic). Other tags are
   * consumer-defined and usable with `evolving run --tags`. Recommended tokens
   * live on AgentContract.tags_vocabulary.
   */
  tags?: readonly string[];
  commands?: readonly StageCommand[];
}

export interface EvolvingConfig {
  version: 2;
  stages: readonly Stage[];
}

export interface StepResult {
  name: string;
  code: number;
  output: string;
  seconds: number;
  /** True when spawn failed because the executable was not found (ENOENT). */
  missingExecutable?: boolean;
}

export type RunCommandName = "run";

/** One gate/command step as exposed to agents (JSON stdout / last-run). */
export interface ReportStep {
  name: string;
  ok: boolean;
  code: number;
  seconds: number;
  log?: string;
  output_preview?: string;
  missing_executable?: boolean;
}

/** Top-level failure summary so agents need not scan steps[]. */
export interface FailureSummary {
  name: string;
  log?: string;
  output_preview?: string;
}

export interface SelectionReportMeta {
  changed_paths_count: number;
  selected: readonly string[];
  /** Ids with no run_in_file_change that were in the selection. */
  always_on: readonly string[];
}

export interface RunReport {
  evolving: 1;
  command: RunCommandName;
  ok: boolean;
  exit_code: number;
  seconds: number;
  steps: readonly ReportStep[];
  failed: readonly string[];
  /** Structured failures (name / log / output_preview). Empty on success. */
  failure: readonly FailureSummary[];
  /** Stage that was run; omitted on successful multi-stage `--tags`/`--ids` runs. */
  stage_id?: string;
  /** Absolute path to .evolving/last-run.json after persist. */
  last_run_path?: string;
  step_count?: number;
  passed_count?: number;
  selection?: SelectionReportMeta;
  finished_at?: string;
  cwd?: string;
}

export interface AgentContract {
  stages_order: "document";
  agent_stages: "no commands; agent-evaluated";
  machine_stages: "has commands; CLI run";
  resume_on_fail: "nearest prior agent stage";
  protocol_source: "evolving explain";
  do_not_duplicate_in_downstream_docs: true;
  skip_when_vocabulary: readonly string[];
  tags_vocabulary: readonly string[];
}

export interface StageCommandView {
  id: string;
  name: string;
  command: readonly string[];
  run_in_file_change?: readonly string[];
  onMissing?: "warn";
  showOutputOnSuccess?: boolean;
}

/** Minimal stage row — progressive map only; no agent body or command argv. */
export interface StageView {
  id: string;
  runnable: boolean;
}

export interface StagesView {
  evolving: 1;
  command: "stages";
  contract: AgentContract;
  /** Ordered id+runnable map — never a full detail dump. */
  stages: readonly StageView[];
  /** First stage to consider (same shape; no panorama). */
  first: StageView | null;
  progressive: string;
}

export interface StatusReport {
  evolving: 1;
  command: "status";
  state: "none" | "ok" | "failed";
  ok: boolean | null;
  failed?: readonly string[];
  failure?: readonly FailureSummary[];
  last_run_path?: string;
  /** Present when status --full, or omitted on slim default. */
  last_run?: RunReport;
  next: readonly string[];
}

export type ExplainTopicId =
  | "contract"
  | "run"
  | "stages"
  | "status"
  | "json"
  | "agent";

export interface ExplainTopicRef {
  id: ExplainTopicId;
  summary: string;
}

/** Lightweight project snapshot for explain index (no command argv / agent body). */
export interface ExplainProjectSummary {
  stage_ids: readonly string[];
  agent_stage_ids: readonly string[];
  machine_stage_ids: readonly string[];
  first_stage_id: string | null;
  first_machine_stage_id: string | null;
}

export interface ExplainReport {
  evolving: 1;
  command: "explain";
  topic: ExplainTopicId | "index";
  summary: string;
  ok: boolean;
  exit_code: number;
  contract: AgentContract;
  topics?: readonly ExplainTopicRef[];
  project?: ExplainProjectSummary | null;
  detail?: unknown;
  how_to_run?: readonly string[];
  see_also?: readonly ExplainTopicId[];
  next?: readonly string[];
  error?: string;
  text?: string;
}

export const COMMAND_REF_PREFIX = "command://";

export function isCommandRef(token: string): boolean {
  return token.startsWith(COMMAND_REF_PREFIX);
}

export function commandRefId(token: string): string {
  return token.slice(COMMAND_REF_PREFIX.length);
}

/** True when every argv element is a command:// ref (composition entry). */
export function isRefOnlyCommand(command: readonly string[]): boolean {
  return command.length > 0 && command.every(isCommandRef);
}
