/** Minimal v2 evolving.yml: optional prepare + verify commands list. */
export function minimalV2Yaml(options: {
  verifyCommandsYaml: string;
  prepareCommandsYaml?: string;
}): string {
  const prepare =
    options.prepareCommandsYaml === undefined
      ? ""
      : `
  - id: prepare
    kind: prepare
    commands:
${options.prepareCommandsYaml}`;
  return `
version: 2
after_edit: [prepare, verify]
stages:${prepare}
  - id: verify
    kind: verify
    commands:
${options.verifyCommandsYaml}
`;
}
