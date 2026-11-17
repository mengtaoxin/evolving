import {
  AGENT_CONTRACT,
  agentContractText,
  SKIP_WHEN_VOCABULARY,
  TAGS_VOCABULARY,
} from "../src/contract.ts";

describe("agent contract", () => {
  it("exposes stable contract fields", () => {
    expect(AGENT_CONTRACT.stages_order).toBe("document");
    expect(AGENT_CONTRACT.agent_stages).toBe("no commands; agent-evaluated");
    expect(AGENT_CONTRACT.machine_stages).toBe("has commands; CLI run/finish");
    expect(AGENT_CONTRACT.resume_on_fail).toBe("nearest prior agent stage");
    expect(AGENT_CONTRACT.finish_runs).toBe("all machine stages in order");
    expect(AGENT_CONTRACT.protocol_source).toBe("evolving explain");
    expect(AGENT_CONTRACT.do_not_duplicate_in_downstream_docs).toBe(true);
    expect(AGENT_CONTRACT.skip_when_vocabulary).toEqual([...SKIP_WHEN_VOCABULARY]);
    expect(AGENT_CONTRACT.tags_vocabulary).toEqual([...TAGS_VOCABULARY]);
  });

  it("renders a copy-pasteable protocol text", () => {
    const text = agentContractText();
    expect(text).toContain("evolving explain");
    expect(text).toContain("evolving run");
    expect(text).toMatch(/quiet JSON object/i);
    expect(text).not.toContain("--json");
    expect(text).toContain("machine stage");
    expect(text).toContain("do_not:");
    expect(text).toMatch(/Never head\/tail\/tee/i);
    expect(text).toContain(".evolving/logs/");
    expect(text).toMatch(/do not re-run to re-read/i);
    expect(text).toMatch(/do not duplicate/i);
    expect(text).toMatch(/run_in_file_change|command:\/\//i);
    expect(text).toMatch(/CLI panorama/i);
    expect(text).toMatch(/Read evolving\.yml for the current/i);
    expect(text).toMatch(/nearest prior agent stage/i);
    expect(text).toMatch(/tags are optional/i);
    expect(text).toMatch(/id\+runnable only/i);
    expect(text).not.toMatch(/evolving prepare|evolving verify/i);
    for (const token of SKIP_WHEN_VOCABULARY) {
      expect(text).toContain(token);
    }
    for (const token of TAGS_VOCABULARY) {
      expect(text).toContain(token);
    }
  });
});
