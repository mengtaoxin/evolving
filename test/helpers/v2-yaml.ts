/** Minimal v2 evolving.yml: optional prepare stage + verify with given check YAML. */
export function minimalV2Yaml(options: {
  checkYaml: string;
  prepareStepsYaml?: string;
  suitesYaml?: string;
  alwaysYaml?: string;
}): string {
  const prepare =
    options.prepareStepsYaml === undefined
      ? ""
      : `
  - id: prepare
    kind: prepare
    steps:
${options.prepareStepsYaml}`;
  return `
version: 2
after_edit: [prepare, verify]
stages:${prepare}
  - id: verify
    kind: verify
    check:
${options.checkYaml}
    detect: git
    suites: ${options.suitesYaml ?? "{}"}
${options.alwaysYaml ? `    always:\n${options.alwaysYaml}` : ""}
`;
}
