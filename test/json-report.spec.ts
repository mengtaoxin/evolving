import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/check.ts";
import { lastRunPath } from "../src/last-run.ts";
import { loadConfig } from "../src/load-config.ts";
import { runPrepare } from "../src/prepare.ts";
import { outputPreview } from "../src/report.ts";
import { buildStatus } from "../src/status.ts";

function writeMinimal(dir: string, checkYaml: string, prepareYaml = ""): void {
  writeFileSync(
    join(dir, "evolving.yml"),
    `
version: 1
workflow:
  - id: prepare
    kind: run
    command: ["npx", "evolving", "prepare"]
  - id: verify
    kind: run
    command: ["true"]
gates:
${prepareYaml}
  check:
${checkYaml}
  verify:
    detect: git
    suites: {}
`,
  );
}

describe("json RunReport", () => {
  it("returns structured JSON fields and writes last-run on prepare", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-json-prepare-"));
    writeMinimal(
      dir,
      `    - command: ["true"]
`,
      `  prepare:
    - name: touch
      command: ["node", "-e", "require('node:fs').writeFileSync('ok.txt','1')"]
`,
    );
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    let report;
    try {
      report = await runPrepare(dir, loadConfig(dir));
    } finally {
      console.log = original;
    }
    expect(report.evolving).toBe(1);
    expect(report.command).toBe("prepare");
    expect(report.ok).toBe(true);
    expect(report.exit_code).toBe(0);
    expect(report.steps[0]?.name).toBe("touch");
    expect(report.last_run_path).toBe(lastRunPath(dir));
    expect(report.failure).toEqual([]);
    expect(lines).toHaveLength(1);
    const printed = JSON.parse(lines[0] as string);
    expect(printed.command).toBe("prepare");
    expect(printed.ok).toBe(true);
    expect(printed.steps).toBeUndefined();
    expect(printed.step_count).toBe(1);
    expect(printed.last_run_path).toBe(lastRunPath(dir));
    const saved = JSON.parse(readFileSync(lastRunPath(dir), "utf8"));
    expect(saved.finished_at).toBeTruthy();
    expect(saved.cwd).toBe(dir);
    expect(saved.steps[0]?.name).toBe("touch");
    expect(saved.last_run_path).toBe(lastRunPath(dir));
  });

  it("includes fix on failed check steps", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-json-fix-"));
    writeMinimal(
      dir,
      `    - name: format:check
      command: ["node", "-e", "console.error('Error: boom'); process.exit(1)"]
      fix: ["npm", "run", "format"]
`,
    );
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    let report;
    try {
      report = await runCheck(dir, loadConfig(dir));
    } finally {
      console.log = original;
    }
    expect(report.ok).toBe(false);
    expect(report.failed).toContain("format:check");
    expect(report.failure[0]?.name).toBe("format:check");
    expect(report.failure[0]?.fix).toEqual(["npm", "run", "format"]);
    expect(report.failure[0]?.log).toMatch(/\/tmp\/evolving-format-check-/);
    expect(report.last_run_path).toBe(lastRunPath(dir));
    expect(report.steps[0]?.fix).toEqual(["npm", "run", "format"]);
    expect(report.steps[0]?.log).toMatch(/\/tmp\/evolving-format-check-/);
    expect(report.steps[0]?.output_preview).toMatch(/Error/);

    const printed = JSON.parse(lines[0] as string);
    expect(printed.failure[0]?.fix).toEqual(["npm", "run", "format"]);
    expect(printed.last_run_path).toBe(lastRunPath(dir));

    const status = buildStatus(dir);
    expect(status.state).toBe("failed");
    expect(status.next[0]).toBe("prepare");
    expect(status.last_run).toBeUndefined();
    expect(status.failure?.[0]?.name).toBe("format:check");
  });

  it("outputPreview prefers Error window then tail", () => {
    const noise = Array.from({ length: 60 }, (_, i) => `noise ${i}`);
    const withError = [...noise.slice(0, 50), "Error: real failure", ...noise.slice(50)].join(
      "\n",
    );
    const preview = outputPreview(withError, 10);
    expect(preview).toContain("Error: real failure");
    expect(preview).toMatch(/earlier lines|more lines/);

    const noError = noise.join("\n");
    const tail = outputPreview(noError, 10);
    expect(tail).toContain("noise 59");
    expect(tail).toContain("earlier lines");
    expect(tail).not.toContain("noise 0");
  });
});
