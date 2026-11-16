import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { AGENT_CONTRACT } from "../src/contract.ts";
import { parseConfig } from "../src/load-config.ts";
import { buildWorkflowView, printWorkflow } from "../src/workflow.ts";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/minimal.evolving.yml",
);

describe("printWorkflow", () => {
  it("prints JSON workflow view", () => {
    const config = parseConfig(parseYaml(readFileSync(fixturePath, "utf8")));
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      printWorkflow(config);
    } finally {
      console.log = original;
    }
    expect(lines).toHaveLength(1);
    const view = JSON.parse(lines[0] as string);
    expect(view.command).toBe("workflow");
    expect(view.workflow.map((s: { id: string }) => s.id)).toContain("prepare");
    expect(view.gates.prepare.some((s: { name?: string }) => s.name === "format")).toBe(true);
  });

  it("buildWorkflowView includes contract and gates", () => {
    const config = parseConfig(parseYaml(readFileSync(fixturePath, "utf8")));
    const view = buildWorkflowView(config);
    expect(view.evolving).toBe(1);
    expect(view.command).toBe("workflow");
    expect(view.contract).toEqual(AGENT_CONTRACT);
    expect(view.workflow.map((s) => s.id)).toContain("prepare");
    expect(view.gates.check[0]?.fix).toEqual(["npm", "run", "format"]);
    expect(view.gates.verify.suites.lib?.paths).toEqual(["packages/lib/"]);
  });
});
