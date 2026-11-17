import { AGENT_CONTRACT, agentContractText, SKIP_WHEN_VOCABULARY } from "../src/contract.ts";

describe("agent contract", () => {
  it("exposes stable contract fields", () => {
    expect(AGENT_CONTRACT.order).toEqual(["prepare", "verify"]);
    expect(AGENT_CONTRACT.after_edit).toEqual(["prepare", "verify"]);
    expect(AGENT_CONTRACT.finish_runs).toBe("non-guidance stages");
    expect(AGENT_CONTRACT.protocol_source).toBe("evolving explain");
    expect(AGENT_CONTRACT.do_not_duplicate_in_downstream_docs).toBe(true);
    expect(AGENT_CONTRACT.skip_when_vocabulary).toEqual([...SKIP_WHEN_VOCABULARY]);
  });

  it("renders a copy-pasteable protocol text", () => {
    const text = agentContractText();
    expect(text).toContain("evolving explain");
    expect(text).toContain("evolving prepare");
    expect(text).toContain("evolving verify");
    expect(text).toMatch(/quiet JSON object/i);
    expect(text).not.toContain("--json");
    expect(text).toContain("non-guidance");
    expect(text).toContain("do_not:");
    expect(text).toMatch(/Never head\/tail\/tee/i);
    expect(text).toContain(".evolving/logs/");
    expect(text).toMatch(/do not re-run to re-read/i);
    expect(text).toMatch(/do not duplicate/i);
    expect(text).toMatch(/run_in_file_change|command:\/\//i);
    expect(text).not.toMatch(/check ⊂ verify/i);
    expect(text).toMatch(/no CLI panorama/i);
    expect(text).toMatch(/Read evolving\.yml for the current guidance step/i);
    expect(text).not.toMatch(/evolving stages.*full|full snapshot.*evolving stages/i);
    for (const token of SKIP_WHEN_VOCABULARY) {
      expect(text).toContain(token);
    }
  });
});
