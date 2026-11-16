import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { AGENT_CONTRACT } from "../src/contract.ts";
import {
  buildExplainIndex,
  buildExplainTopic,
  EXPLAIN_TOPICS,
  resolveExplain,
} from "../src/explain.ts";
import { parseConfig } from "../src/load-config.ts";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/minimal.evolving.yml",
);

function loadFixture() {
  return parseConfig(parseYaml(readFileSync(fixturePath, "utf8")));
}

describe("explain", () => {
  it("index without config returns topics and null project", () => {
    const report = buildExplainIndex(null, undefined, "Missing evolving.yml");
    expect(report.topic).toBe("index");
    expect(report.ok).toBe(true);
    expect(report.project).toBeNull();
    expect(report.error).toMatch(/Missing/);
    expect(report.topics?.map((t) => t.id)).toEqual(EXPLAIN_TOPICS.map((t) => t.id));
    expect(JSON.stringify(report)).not.toContain("npm run format");
    expect(report.next).toEqual(["explain contract"]);
  });

  it("index with fixture summarizes project without dumping gate argv", () => {
    const config = loadFixture();
    const report = buildExplainIndex(config);
    expect(report.project?.workflow_ids).toEqual([
      "orient",
      "tests",
      "prepare",
      "verify",
      "docs",
    ]);
    expect(report.project?.suite_ids).toEqual(["lib", "app", "shared", "deps"]);
    expect(report.project?.has_prepare).toBe(true);
    expect(report.project?.prepare_count).toBe(2);
    expect(report.next).toEqual(["explain prepare"]);
    const blob = JSON.stringify(report);
    expect(blob).not.toContain("npm run format");
    expect(blob).not.toContain("test:lib");
  });

  it("explain prepare includes this repo prepare commands", () => {
    const report = buildExplainTopic("prepare", loadFixture());
    expect(report.topic).toBe("prepare");
    expect(report.how_to_run).toContain("evolving prepare --json");
    const steps = (report.detail as { steps: Array<{ name?: string; command: string[] }> }).steps;
    expect(steps.map((s) => s.name)).toEqual(["format", "lint:fix"]);
    expect(steps[0]?.command).toEqual(["npm", "run", "format"]);
  });

  it("unknown topic fails with exit_code 2 and lists topics", () => {
    const report = resolveExplain("nope", loadFixture());
    expect(report.ok).toBe(false);
    expect(report.exit_code).toBe(2);
    expect(report.error).toMatch(/Unknown topic: nope/);
    expect(report.error).toContain("prepare");
  });

  it("explain contract matches AGENT_CONTRACT (agent-contract alias target)", () => {
    const report = buildExplainTopic("contract", null);
    expect(report.detail).toMatchObject({ contract: AGENT_CONTRACT });
    expect(report.text).toContain("evolving explain");
    expect((report.detail as { contract: unknown }).contract).toEqual(AGENT_CONTRACT);
  });
});
