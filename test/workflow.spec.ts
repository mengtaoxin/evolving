import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseConfig } from "../src/load-config.ts";
import { printWorkflow } from "../src/workflow.ts";

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
    expect(lines.join("\n")).toContain("[guidance] orient");
    expect(lines.join("\n")).toContain("[run] verify");
    expect(lines.join("\n")).toContain("npx evolving verify");
  });
});
