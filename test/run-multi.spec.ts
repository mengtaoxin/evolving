import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/load-config.ts";
import {
  resolveStagesByIds,
  runStages,
  stagesMatchingTags,
} from "../src/run-stage.ts";
import {
  agentStageYaml,
  machineStageYaml,
  minimalV2Yaml,
} from "./helpers/v2-yaml.ts";

async function captureRunStages(
  dir: string,
  stages: Parameters<typeof runStages>[1],
) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await runStages(dir, stages);
  } finally {
    console.log = originalLog;
  }
}

describe("runStages / --tags / --ids", () => {
  it("runs machine stages matching tags (OR)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-run-tags-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        stagesYaml: [
          machineStageYaml(
            "prepare",
            `      - name: touch
        command: ["node", "-e", "require('node:fs').writeFileSync('tagged.txt','ok')"]`,
            { tags: ["gate"] },
          ),
          machineStageYaml(
            "other",
            `      - name: skip
        command: ["node", "-e", "require('node:fs').writeFileSync('skipped.txt','no')"]`,
          ),
        ].join("\n"),
      }),
    );
    const config = loadConfig(dir);
    const report = await captureRunStages(dir, stagesMatchingTags(config, ["gate"]));
    expect(report.exit_code).toBe(0);
    expect(report.command).toBe("run");
    expect(report.ok).toBe(true);
    expect(report.stage_id).toBeUndefined();
    expect(report.steps.map((s) => s.name)).toEqual(["touch"]);
    expect(
      await import("node:fs").then((fs) => fs.readFileSync(join(dir, "tagged.txt"), "utf8")),
    ).toBe("ok");
    expect(existsSync(join(dir, "skipped.txt"))).toBe(false);
  });

  it("runs stages by --ids order and skips agent stages", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-run-ids-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        stagesYaml: [
          agentStageYaml("edit", { summary: "change" }),
          machineStageYaml(
            "prepare",
            `      - name: a
        command: ["node", "-e", "require('node:fs').appendFileSync('order.txt','a')"]`,
          ),
          machineStageYaml(
            "verify",
            `      - name: b
        command: ["node", "-e", "require('node:fs').appendFileSync('order.txt','b')"]`,
          ),
        ].join("\n"),
      }),
    );
    const config = loadConfig(dir);
    const resolved = resolveStagesByIds(config, ["edit", "verify", "prepare"]);
    expect(resolved.error).toBeUndefined();
    expect(resolved.stages.map((s) => s.id)).toEqual(["verify", "prepare"]);
    const report = await captureRunStages(dir, resolved.stages);
    expect(report.exit_code).toBe(0);
    expect(
      await import("node:fs").then((fs) => fs.readFileSync(join(dir, "order.txt"), "utf8")),
    ).toBe("ba");
  });

  it("succeeds with empty steps when no tags match", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-run-empty-"));
    writeFileSync(
      join(dir, "evolving.yml"),
      minimalV2Yaml({
        stagesYaml: machineStageYaml(
          "local-only",
          `      - name: touch
        command: ["node", "-e", "require('node:fs').writeFileSync('skipped.txt','no')"]`,
        ),
      }),
    );
    const config = loadConfig(dir);
    const report = await captureRunStages(dir, stagesMatchingTags(config, ["gate"]));
    expect(report.exit_code).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.steps).toEqual([]);
    expect(existsSync(join(dir, "skipped.txt"))).toBe(false);
  });

  it("resolveStagesByIds errors on unknown id", () => {
    const dir = mkdtempSync(join(tmpdir(), "evolving-run-unknown-"));
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
    const resolved = resolveStagesByIds(loadConfig(dir), ["missing"]);
    expect(resolved.error).toMatch(/Unknown stage id: missing/);
    expect(resolved.stages).toEqual([]);
  });
});
