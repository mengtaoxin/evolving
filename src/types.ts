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
}
