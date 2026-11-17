import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/load-config.ts";
import { runPrepare } from "../src/prepare.ts";
import { minimalV2Yaml } from "./helpers/v2-yaml.ts";

describe("runPrepare", () => {
  it("runs prepare stage commands and returns 0 on success", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-prepare-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        verifyCommandsYaml: `      - name: ok
        command: ["true"]`,
        prepareCommandsYaml: `      - name: touch
        command: ["node", "-e", "require('node:fs').writeFileSync('prepared.txt','ok')"]`,
      }),
    );
    const original = console.log;
    console.log = () => {};
    let report;
    try {
      report = await runPrepare(dir, loadConfig(dir));
    } finally {
      console.log = original;
    }
    expect(report.exit_code).toBe(0);
    expect(
      await import("node:fs").then((fs) => fs.readFileSync(join(dir, "prepared.txt"), "utf8")),
    ).toBe("ok");
  });

  it("exits 0 with empty commands when prepare stage is omitted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-prepare-empty-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        verifyCommandsYaml: `      - name: ok
        command: ["true"]`,
      }),
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
    expect(report.exit_code).toBe(0);
    expect(report.steps).toEqual([]);
    expect(JSON.parse(lines[0] as string).command).toBe("prepare");
  });
});
