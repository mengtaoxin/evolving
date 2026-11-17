/** Minimal v2 evolving.yml helper for tests. */
export function minimalV2Yaml(options: {
  stagesYaml: string;
}): string {
  return `
version: 2
stages:
${options.stagesYaml}
`;
}

/** One machine stage with the given commands YAML body (indented items). */
export function machineStageYaml(id: string, commandsYaml: string): string {
  return `  - id: ${id}
    commands:
${commandsYaml}`;
}

/** Agent stage (no commands). */
export function agentStageYaml(
  id: string,
  fields: {
    summary?: string;
    refs?: string[];
    skip_when?: string;
    tags?: string[];
  } = {},
): string {
  const lines = [`  - id: ${id}`];
  if (fields.summary) lines.push(`    summary: ${JSON.stringify(fields.summary)}`);
  if (fields.refs) lines.push(`    refs: ${JSON.stringify(fields.refs)}`);
  if (fields.skip_when) lines.push(`    skip_when: ${fields.skip_when}`);
  if (fields.tags) lines.push(`    tags: ${JSON.stringify(fields.tags)}`);
  return lines.join("\n");
}
