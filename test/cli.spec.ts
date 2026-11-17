import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { agentStageYaml, machineStageYaml, minimalV2Yaml } from "./helpers/v2-yaml.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(repoRoot, "dist/cli.js");

function runCli(
  args: string[],
  cwd: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("cli json default", () => {
  it("status emits json with no flags", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-cli-status-"));
    const result = runCli(["status"], dir);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.command).toBe("status");
    expect(parsed.state).toBe("none");
  });

  it("status --full embeds last_run after a failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-cli-full-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        stagesYaml: [
          agentStageYaml("edit", { summary: "change code" }),
          machineStageYaml(
            "verify",
            `      - name: lint
        command: ["node", "-e", "process.exit(1)"]`,
          ),
        ].join("\n"),
      }),
    );
    const run = runCli(["run", "verify"], dir);
    expect(run.status).toBe(1);
    const slim = runCli(["status"], dir);
    expect(JSON.parse(slim.stdout.trim()).last_run).toBeUndefined();
    const full = runCli(["status", "--full"], dir);
    const parsed = JSON.parse(full.stdout.trim());
    expect(parsed.last_run?.command).toBe("run");
    expect(parsed.last_run?.stage_id).toBe("verify");
    expect(parsed.failed).toContain("lint");
    expect(parsed.next[0]).toBe("edit");
  });

  it("prepare/verify/check/finish commands are rejected", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-cli-gone-"));
    for (const cmd of ["prepare", "verify", "check", "finish"]) {
      const result = runCli([cmd], dir);
      expect(result.status).toBe(2);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toMatch(/was removed/i);
      expect(parsed.error).toMatch(/--tags|--ids/);
    }
  });

  it("run requires a stage id, --tags, or --ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-cli-run-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        stagesYaml: machineStageYaml(
          "verify",
          `      - name: ok
        command: ["true"]`,
        ),
      }),
    );
    const result = runCli(["run"], dir);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout.trim()).error).toMatch(/stage id|--tags|--ids/i);
  });

  it("run --tags and --ids are mutually exclusive with each other and stage id", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-cli-mutex-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        stagesYaml: machineStageYaml(
          "verify",
          `      - name: ok
        command: ["true"]`,
          { tags: ["gate"] },
        ),
      }),
    );
    const both = runCli(["run", "--tags", "gate", "--ids", "verify"], dir);
    expect(both.status).toBe(2);
    expect(JSON.parse(both.stdout.trim()).error).toMatch(/only one of --tags or --ids/i);

    const withId = runCli(["run", "verify", "--tags", "gate"], dir);
    expect(withId.status).toBe(2);
    expect(JSON.parse(withId.stdout.trim()).error).toMatch(/cannot be combined/i);
  });

  it("run --tags executes matching machine stages", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-cli-tags-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        stagesYaml: machineStageYaml(
          "verify",
          `      - name: ok
        command: ["true"]`,
          { tags: ["gate"] },
        ),
      }),
    );
    const result = runCli(["run", "--tags", "gate"], dir);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.command).toBe("run");
    expect(parsed.ok).toBe(true);
    expect(parsed.step_count).toBe(1);
    expect(parsed.passed_count).toBe(1);
  });
});
