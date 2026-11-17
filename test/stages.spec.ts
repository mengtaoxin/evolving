import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { AGENT_CONTRACT } from "../src/contract.ts";
import { parseConfig } from "../src/load-config.ts";
import { buildStagesView, printStages } from "../src/stages.ts";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/minimal.evolving.yml",
);

describe("printStages", () => {
  it("prints minimal JSON stages map without panorama detail", () => {
    const config = parseConfig(parseYaml(readFileSync(fixturePath, "utf8")));
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      printStages(config);
    } finally {
      console.log = original;
    }
    expect(lines).toHaveLength(1);
    const view = JSON.parse(lines[0] as string);
    expect(view.command).toBe("stages");
    expect(view.stages.map((s: { id: string }) => s.id)).toEqual([
      "orient",
      "edit",
      "prepare",
      "verify",
      "docs",
    ]);
    expect(view.first).toEqual({ id: "orient", runnable: false });
    const blob = JSON.stringify(view);
    expect(blob).not.toContain("npm run format");
    expect(blob).not.toContain("Locate entry files");
    expect(blob).not.toContain("docs/overview.md");
    expect(blob).not.toContain("test:lib");
  });

  it("buildStagesView is id+runnable only with progressive hint", () => {
    const config = parseConfig(parseYaml(readFileSync(fixturePath, "utf8")));
    const view = buildStagesView(config);
    expect(view.evolving).toBe(1);
    expect(view.command).toBe("stages");
    expect(view.contract.stages_order).toEqual(AGENT_CONTRACT.stages_order);
    expect(view.stages).toEqual([
      { id: "orient", runnable: false },
      { id: "edit", runnable: false },
      { id: "prepare", runnable: true },
      { id: "verify", runnable: true },
      { id: "docs", runnable: false },
    ]);
    expect(view.first).toEqual({ id: "orient", runnable: false });
    expect(view.progressive).toMatch(/no panorama/i);
    const verify = view.stages.find((s) => s.id === "verify");
    expect(verify).toEqual({ id: "verify", runnable: true });
    expect(verify).not.toHaveProperty("commands");
    expect(verify).not.toHaveProperty("tags");
    const edit = view.stages.find((s) => s.id === "edit");
    expect(edit).toEqual({ id: "edit", runnable: false });
    expect(edit).not.toHaveProperty("tags");
  });
});
