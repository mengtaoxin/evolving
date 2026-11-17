/** A single shell invocation declared in evolving.yml. */
export interface GateCommand {
  /** argv: first element is the executable. */
  command: readonly string[];
  /** Optional display name (defaults to a joined command). */
  name?: string;
  env?: Readonly<Record<string, string>>;
  /** When true, non-empty stdout/stderr is printed even on success (e.g. lint warnings). */
  showOutputOnSuccess?: boolean;
  /**
   * When the executable is not on PATH (`spawn` ENOENT): `warn` prints a
   * reminder and does not fail the gate. Other non-zero exits still fail.
   */
  onMissing?: "warn";
}

/**
 * One verify list item. `command` is either a real argv or only `command://id` refs.
 * Optional `run_in_file_change` selects via git; omit to always run.
 */
export interface VerifyCommand {
  id: string;
  name: string;
  command: readonly string[];
  run_in_file_change?: readonly string[];
  env?: Readonly<Record<string, string>>;
  showOutputOnSuccess?: boolean;
  onMissing?: "warn";
}

/** Agent-only checklist step; CLI never executes. */
export interface GuidanceStage {
  id: string;
  kind: "guidance";
  summary?: string;
  refs?: readonly string[];
  /** Documentation-only skip hint for agents; the CLI never evaluates it. */
  skip_when?: string;
}

/** Write-allowed machine stage (format / lint:fix). At most one per config. */
export interface PrepareStage {
  id: string;
  kind: "prepare";
  commands: readonly GateCommand[];
}

/** Read-only verify stage. Exactly one per config. */
export interface VerifyStage {
  id: string;
  kind: "verify";
  commands: readonly VerifyCommand[];
}

/** One-shot machine command included by finish (e.g. codegen). */
export interface RunStage {
  id: string;
  kind: "run";
  command: readonly string[];
  env?: Readonly<Record<string, string>>;
}

export type Stage = GuidanceStage | PrepareStage | VerifyStage | RunStage;

export type AfterEditStep = "prepare" | "verify";

export interface EvolvingConfig {
  version: 2;
  /** Protocol order after code edits; surfaced by explain/contract. */
  after_edit: readonly AfterEditStep[];
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

export type RunCommandName = "prepare" | "verify" | "finish";

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

export interface VerifyReportMeta {
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
  /** Absolute path to .evolving/last-run.json after persist. */
  last_run_path?: string;
  step_count?: number;
  passed_count?: number;
  verify?: VerifyReportMeta;
  finished_at?: string;
  cwd?: string;
}

export interface AgentContract {
  order: readonly AfterEditStep[];
  after_edit: readonly AfterEditStep[];
  prepare_writes: true;
  verify_readonly: true;
  finish_runs: "non-guidance stages";
  guidance: "agent-evaluated; CLI does not execute";
  protocol_source: "evolving explain";
  do_not_duplicate_in_downstream_docs: true;
  do_not_hand_edit_when_prepare_exists: true;
  skip_when_vocabulary: readonly string[];
}

export interface GateCommandView {
  name?: string;
  command: readonly string[];
  onMissing?: "warn";
  showOutputOnSuccess?: boolean;
}

export interface VerifyCommandView {
  id: string;
  name: string;
  command: readonly string[];
  run_in_file_change?: readonly string[];
  onMissing?: "warn";
  showOutputOnSuccess?: boolean;
}

/** Minimal stage row — progressive map only; no guidance body or gate argv. */
export interface StageView {
  id: string;
  kind: Stage["kind"];
}

export interface StagesView {
  evolving: 1;
  command: "stages";
  contract: AgentContract;
  after_edit: readonly AfterEditStep[];
  /** Ordered id+kind map — never a full detail dump. */
  stages: readonly StageView[];
  /** First stage to consider (same id+kind shape; no panorama). */
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
  | "prepare"
  | "verify"
  | "finish"
  | "stages"
  | "status"
  | "json"
  | "guidance";

export interface ExplainTopicRef {
  id: ExplainTopicId;
  summary: string;
}

/** Lightweight project snapshot for explain index (no gate argv / guidance body). */
export interface ExplainProjectSummary {
  stage_ids: readonly string[];
  after_edit: readonly AfterEditStep[];
  command_ids: readonly string[];
  has_prepare: boolean;
  prepare_count: number;
  verify_count: number;
  always_on_count: number;
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
