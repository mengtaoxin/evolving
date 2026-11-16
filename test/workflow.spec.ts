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
  it("prints guidance and run steps", () => {
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
    const text = lines.join("\n");
    expect(text).toContain("[guidance] orient");
    expect(text).toContain("[run] prepare");
    expect(text).toContain("npx evolving prepare");
    expect(text).toContain("[run] verify");
    expect(text).toContain("npx evolving verify");
    expect(text).toContain("gates.prepare");
    expect(text).toContain("format: npm run format");
    expect(text).toContain("contract:");
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
