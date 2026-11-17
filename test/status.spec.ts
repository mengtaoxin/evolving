import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lastRunPath, writeLastRun } from "../src/last-run.ts";
import { loadConfig } from "../src/load-config.ts";
import { buildStatus, printStatus } from "../src/status.ts";
import type { RunReport } from "../src/types.ts";
import { runVerify } from "../src/verify.ts";
import { minimalV2Yaml } from "./helpers/v2-yaml.ts";

describe("status", () => {
  it("returns state none when no last-run exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-none-"));
    const status = buildStatus(dir);
    expect(status).toEqual({
      evolving: 1,
      command: "status",
      state: "none",
      ok: null,
      next: ["explain"],
    });
  });

  it("suggests prepare then verify when an always-on command failed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-always-fail-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        verifyCommandsYaml: `      - name: lint
        command: ["node", "-e", "process.exit(1)"]`,
      }),
    );
    const original = console.log;
    console.log = () => {};
    try {
      await runVerify(dir, loadConfig(dir), []);
    } finally {
      console.log = original;
    }
    const status = buildStatus(dir);
    expect(status.state).toBe("failed");
    expect(status.next).toEqual(["prepare", "verify"]);
    expect(status.last_run).toBeUndefined();
    expect(status.failure?.[0]?.name).toBe("lint");
    expect(status.last_run_path).toBe(lastRunPath(dir));
  });

  it("default omits last_run; --full embeds it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-full-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        verifyCommandsYaml: `      - name: lint
        command: ["node", "-e", "process.exit(1)"]`,
      }),
    );
    const original = console.log;
    console.log = () => {};
    try {
      await runVerify(dir, loadConfig(dir), []);
    } finally {
      console.log = original;
    }
    const slim = buildStatus(dir);
    expect(slim.last_run).toBeUndefined();
    expect(slim.failed).toContain("lint");

    const full = buildStatus(dir, { full: true });
    expect(full.last_run?.command).toBe("verify");
    expect(full.last_run?.failed).toContain("lint");
  });

  it("always-on failure suggests prepare then full verify", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-always-"));
    const report: RunReport = {
      evolving: 1,
      command: "verify",
      ok: false,
      exit_code: 1,
      seconds: 1,
      steps: [
        { name: "test:lib", ok: true, code: 0, seconds: 0.1 },
        { name: "smoke", ok: false, code: 1, seconds: 0.2, log: "/tmp/x.log" },
      ],
      failed: ["smoke"],
      failure: [{ name: "smoke", log: "/tmp/x.log" }],
      verify: {
        changed_paths_count: 1,
        selected: ["test:lib", "smoke"],
        always_on: ["smoke"],
      },
    };
    writeLastRun(dir, report);
    const status = buildStatus(dir);
    expect(status.next).toEqual(["prepare", "verify"]);
  });

  it("path-selected failure may replay selected ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-suite-"));
    const report: RunReport = {
      evolving: 1,
      command: "verify",
      ok: false,
      exit_code: 1,
      seconds: 1,
      steps: [{ name: "test:lib", ok: false, code: 1, seconds: 0.2 }],
      failed: ["test:lib"],
      failure: [{ name: "test:lib" }],
      verify: {
        changed_paths_count: 1,
        selected: ["test:lib", "smoke"],
        always_on: ["smoke"],
      },
    };
    writeLastRun(dir, report);
    const status = buildStatus(dir);
    expect(status.next).toEqual(["verify", "test:lib"]);
  });

  it("printStatus emits one JSON object", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-status-print-"));
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      printStatus(dir);
    } finally {
      console.log = original;
    }
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string).state).toBe("none");
  });
});

describe("verify always next integration", () => {
  it("failed always-on gate yields prepare then verify without command ids", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-verify-always-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      `
version: 2
after_edit: [prepare, verify]
stages:
  - id: verify
    kind: verify
    commands:
      - name: test:lib
        command: ["true"]
        run_in_file_change: ["lib/"]
      - name: smoke
        command: ["node", "-e", "process.exit(1)"]
`,
    );
    const original = console.log;
    console.log = () => {};
    try {
      await runVerify(dir, loadConfig(dir), ["test:lib"]);
    } finally {
      console.log = original;
    }
    const status = buildStatus(dir);
    expect(status.state).toBe("failed");
    expect(status.failed).toContain("smoke");
    expect(status.next).toEqual(["prepare", "verify"]);
  });
});
