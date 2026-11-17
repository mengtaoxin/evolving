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
    expect(report.summary).toMatch(/quiet JSON/i);
    expect(report.summary).toMatch(/Never pipe/i);
    expect(report.summary).toMatch(/sole agent protocol/i);
    expect(report.detail).toMatchObject({
      protocol_source: "evolving explain",
      do_not_duplicate_in_downstream_docs: true,
      stages_order: "document",
      on_failure: "evolving status",
      never_pipe: true,
    });
    expect(String((report.detail as { on_truncated_view?: string }).on_truncated_view)).toMatch(
      /status --full/i,
    );
    expect(report.how_to_run?.join(" ")).not.toMatch(/\|/);
    expect(report.how_to_run?.join(" ")).not.toContain("--json");
  });

  it("index with fixture summarizes project without dumping gate argv", () => {
    const config = loadFixture();
    const report = buildExplainIndex(config);
    expect(report.project?.stage_ids).toEqual([
      "orient",
      "edit",
      "prepare",
      "verify",
      "docs",
    ]);
    expect(report.project?.agent_stage_ids).toEqual(["orient", "edit", "docs"]);
    expect(report.project?.machine_stage_ids).toEqual(["prepare", "verify"]);
    expect(report.project?.first_stage_id).toBe("orient");
    expect(report.project?.first_machine_stage_id).toBe("prepare");
    expect(report.next).toEqual(["orient"]);
    expect(report.detail).toMatchObject({ no_panorama: true });
    expect(String((report.detail as { progressive?: string }).progressive)).toMatch(
      /no CLI dumps/i,
    );
    const blob = JSON.stringify(report);
    expect(blob).not.toContain("npm run format");
    expect(blob).not.toContain("Locate entry files");
    expect(blob).not.toContain("docs/overview.md");
  });

  it("explain stages is a minimal id+runnable map without panorama", () => {
    const report = buildExplainTopic("stages", loadFixture());
    const detail = report.detail as {
      stages: Array<{ id: string; runnable: boolean }>;
      first: { id: string; runnable: boolean };
      no_panorama: boolean;
    };
    expect(detail.stages).toEqual([
      { id: "orient", runnable: false },
      { id: "edit", runnable: false },
      { id: "prepare", runnable: true },
      { id: "verify", runnable: true },
      { id: "docs", runnable: false },
    ]);
    expect(detail.first).toEqual({ id: "orient", runnable: false });
    expect(detail.no_panorama).toBe(true);
    const blob = JSON.stringify(report);
    expect(blob).not.toContain("Locate entry files");
    expect(blob).not.toContain("docs/overview.md");
    expect(blob).not.toContain("npm run format");
  });

  it("explain agent lists ids only", () => {
    const report = buildExplainTopic("agent", loadFixture());
    const detail = report.detail as {
      agent_stage_ids: string[];
      tags_vocabulary: string[];
    };
    expect(detail.agent_stage_ids).toEqual(["orient", "edit", "docs"]);
    expect(detail.tags_vocabulary).toEqual(["needs-agent"]);
    const blob = JSON.stringify(report);
    expect(blob).not.toContain("Locate entry files");
    expect(blob).not.toContain("docs/overview.md");
  });

  it("explain finish lists machine stages as id+runnable only", () => {
    const report = buildExplainTopic("finish", loadFixture());
    const detail = report.detail as {
      machine_stages: Array<{ id: string; runnable: boolean }>;
      agent_skipped: string[];
    };
    expect(detail.machine_stages).toEqual([
      { id: "prepare", runnable: true },
      { id: "verify", runnable: true },
    ]);
    expect(detail.agent_skipped).toEqual(["orient", "edit", "docs"]);
    expect(JSON.stringify(report)).not.toContain("npm run");
  });

  it("explain run includes machine stage commands", () => {
    const report = buildExplainTopic("run", loadFixture());
    expect(report.topic).toBe("run");
    expect(report.how_to_run?.[0]).toMatch(/evolving run/);
    const stages = (
      report.detail as {
        stages: Array<{ id: string; commands: Array<{ name?: string; command: string[] }> }>;
      }
    ).stages;
    expect(stages.map((s) => s.id)).toEqual(["prepare", "verify"]);
    const prepare = stages.find((s) => s.id === "prepare");
    expect(prepare?.commands.map((s) => s.name)).toEqual(["format", "lint:fix"]);
    expect(prepare?.commands[0]?.command).toEqual(["npm", "run", "format"]);
  });

  it("unknown topic fails with exit_code 2 and lists topics", () => {
    const report = resolveExplain("nope", loadFixture());
    expect(report.ok).toBe(false);
    expect(report.exit_code).toBe(2);
    expect(report.error).toMatch(/Unknown topic: nope/);
    expect(report.error).toContain("run");
    expect(report.error).toContain("stages");
  });

  it("explain contract matches AGENT_CONTRACT (agent-contract alias target)", () => {
    const report = buildExplainTopic("contract", null);
    expect(report.detail).toMatchObject({ contract: AGENT_CONTRACT });
    expect(report.text).toContain("evolving explain");
    expect((report.detail as { contract: unknown }).contract).toEqual(AGENT_CONTRACT);
    const detail = report.detail as { do: string[]; do_not: string[] };
    expect(detail.do.length).toBeGreaterThan(0);
    expect(detail.do_not.some((line) => /^Never pipe/i.test(line))).toBe(true);
    expect(detail.do_not.some((line) => /second-truncate/i.test(line))).toBe(true);
    expect(detail.do_not.some((line) => /downstream/i.test(line))).toBe(true);
    expect(detail.do.some((line) => /status --full/i.test(line))).toBe(true);
  });

  it("explain json documents anti-patterns and failure fields", () => {
    const report = buildExplainTopic("json", null);
    const detail = report.detail as {
      do: string[];
      do_not: string[];
      run_report_fields: string[];
      output_preview: string;
      step_log: string;
    };
    expect(detail.do_not.some((line) => /^Never pipe/i.test(line))).toBe(true);
    expect(detail.run_report_fields).toEqual(
      expect.arrayContaining(["failure", "last_run_path", "output_preview", "stage_id"]),
    );
    expect(detail.output_preview).toMatch(/Evolving-chosen window/i);
    expect(detail.output_preview).not.toMatch(/\btail\b/i);
    expect(detail.step_log).toMatch(/\.evolving\/logs\//);
    expect(report.how_to_run?.join(" ")).not.toMatch(/\|/);
    expect(report.how_to_run?.join(" ")).not.toContain("--json");
    expect(report.summary).toMatch(/quiet JSON object/i);
  });

  it("explain status documents truncated-view recovery", () => {
    const report = buildExplainTopic("status", null);
    const detail = report.detail as {
      logs_dir: string;
      on_truncated_view: string;
      resume_on_fail: string;
    };
    expect(detail.logs_dir).toBe(".evolving/logs/");
    expect(detail.on_truncated_view).toMatch(/status --full/i);
    expect(detail.on_truncated_view).toMatch(/never/i);
    expect(detail.resume_on_fail).toMatch(/nearest prior agent/i);
    expect(report.summary).toMatch(/truncated/i);
  });
});
