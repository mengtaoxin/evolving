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
   * Write-side companion argv. Printed as a hint when this step fails under
   * check/verify; never executed by those commands (use `evolving prepare`).
   */
  fix?: readonly string[];
  /**
   * When the executable is not on PATH (`spawn` ENOENT): `warn` prints a
   * reminder and does not fail the gate. Other non-zero exits still fail.
   */
  onMissing?: "warn";
}

export interface WorkflowStep {
  id: string;
  kind: "guidance" | "run";
  summary?: string;
  refs?: readonly string[];
  /** Documentation-only skip hint for agents; the CLI never evaluates it. */
  skip_when?: string;
  /** Required when kind is run. */
  command?: readonly string[];
  env?: Readonly<Record<string, string>>;
}

export interface VerifySuite {
  paths: readonly string[];
  /**
   * Command to run when this suite is selected.
   * Omit when the suite only expands `also` (e.g. root lockfile → other suites).
   */
  command?: readonly string[];
  /** Suite ids to also select when this suite matches via git detect (not via CLI args). */
  also?: readonly string[];
  env?: Readonly<Record<string, string>>;
  name?: string;
}

export interface VerifyGate {
  detect: "git";
  suites: Readonly<Record<string, VerifySuite>>;
  always?: readonly GateCommand[];
}

export interface EvolvingConfig {
  version: 1;
  workflow: readonly WorkflowStep[];
  gates: {
    /**
     * Write-allowed steps (format / lint:fix). Run via `evolving prepare`.
     * check and verify never run these.
     */
    prepare: readonly GateCommand[];
    check: readonly GateCommand[];
    verify: VerifyGate;
  };
}

export interface StepResult {
  name: string;
  code: number;
  output: string;
  seconds: number;
  /** True when spawn failed because the executable was not found (ENOENT). */
  missingExecutable?: boolean;
}

export type RunCommandName = "prepare" | "check" | "verify" | "finish";

/** One gate/suite step as exposed to agents (JSON stdout / last-run). */
export interface ReportStep {
  name: string;
  ok: boolean;
  code: number;
  seconds: number;
  fix?: readonly string[];
  log?: string;
  output_preview?: string;
  missing_executable?: boolean;
}

/** Top-level failure summary so agents need not scan steps[]. */
export interface FailureSummary {
  name: string;
  fix?: readonly string[];
  log?: string;
  output_preview?: string;
}

export interface VerifyReportMeta {
  check_only: boolean;
  changed_paths_count: number;
  selected_suites: readonly string[];
  always: readonly string[];
}

export interface RunReport {
  evolving: 1;
  command: RunCommandName;
  ok: boolean;
  exit_code: number;
  seconds: number;
  steps: readonly ReportStep[];
  failed: readonly string[];
  /** Structured failures (name / fix / log / output_preview). Empty on success. */
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
  order: readonly ["prepare", "verify"];
  prepare_writes: true;
  check_verify_readonly: true;
  finish_runs: "workflow.kind=run only";
  guidance: "agent-evaluated; CLI does not execute";
  do_not_hand_edit_when_fix_exists: true;
  skip_when_vocabulary: readonly string[];
}

export interface GateCommandView {
  name?: string;
  command: readonly string[];
  fix?: readonly string[];
  onMissing?: "warn";
  showOutputOnSuccess?: boolean;
}

export interface WorkflowStepView {
  id: string;
  kind: "guidance" | "run";
  summary?: string;
  refs?: readonly string[];
  skip_when?: string;
  command?: readonly string[];
}

export interface WorkflowView {
  evolving: 1;
  command: "workflow";
  contract: AgentContract;
  workflow: readonly WorkflowStepView[];
  gates: {
    prepare: readonly GateCommandView[];
    check: readonly GateCommandView[];
    verify: {
      detect: "git";
      suites: Readonly<
        Record<
          string,
          {
            paths: readonly string[];
            command?: readonly string[];
            also?: readonly string[];
            name?: string;
          }
        >
      >;
      always: readonly GateCommandView[];
    };
  };
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
  | "check"
  | "verify"
  | "finish"
  | "workflow"
  | "status"
  | "json"
  | "guidance";

export interface ExplainTopicRef {
  id: ExplainTopicId;
  summary: string;
}

/** Lightweight project snapshot for explain index (no gate argv dump). */
export interface ExplainProjectSummary {
  workflow_ids: readonly string[];
  workflow_run_ids: readonly string[];
  workflow_guidance_ids: readonly string[];
  suite_ids: readonly string[];
  has_prepare: boolean;
  prepare_count: number;
  check_count: number;
  always_count: number;
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
