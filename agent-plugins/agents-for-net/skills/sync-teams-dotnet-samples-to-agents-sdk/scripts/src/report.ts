import type { SyncResult, UpstreamChange, ValidationChecks } from "./types.js";

const TRIGGER_DESCRIPTIONS: Record<string, string> = {
  sourceTree: "Teams samples repository content changed.",
  target: "The sample mapping or manifest packaging configuration changed.",
  policies: "Reviewed migration policies changed.",
  protection: "Owned-path or output protection rules changed.",
  migrationSkill: "The Teams-to-Agents migration instructions changed.",
  manifestSkill: "The Teams manifest instructions changed.",
  canonicalSample: "The canonical Agents sample or reusable manifest assets changed.",
  packagePolicy: "The target framework or Agents SDK package policy changed.",
  validator: "The deterministic validation contract changed.",
};

const CHECKS: Array<{ key: keyof ValidationChecks; title: string; description: string }> = [
  {
    key: "project",
    title: "Project structure and SDK migration",
    description: "Confirms one project, the target framework and Agents SDK packages, required Agents host patterns, and absence of legacy Teams SDK code.",
  },
  { key: "restore", title: "Restore", description: "Runs `dotnet restore` and resolves the project dependencies." },
  { key: "build", title: "Build", description: "Builds the project with warnings as errors." },
  {
    key: "manifest",
    title: "Manifest",
    description: "Checks valid JSON and unique keys, required metadata and packaged icons, the released Teams schema after placeholder substitution, and selected capabilities inferred from the sample code.",
  },
  { key: "httpSmoke", title: "HTTP smoke test", description: "Starts the built sample and requires `GET /` to return HTTP 200." },
  {
    key: "contracts",
    title: "Protected behavior contracts",
    description: "Runs sample-specific contract tests when configured; other samples have no contract test.",
  },
];

function normalizedText(value: string): string {
  return value
    .replace(/\bupstream\b/gi, "Teams repository")
    .replace(/[\r\n]+/g, " ")
    .replaceAll("@", "@\u200b")
    .trim();
}

function safeText(value: string): string {
  return normalizedText(value)
    .replaceAll("\\", "\\\\")
    .replace(/([`*_\[\]!|])/g, "\\$1")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/^([#>+\-])/, "\\$1")
    .replace(/^(\d+)\./, "$1\\.");
}

function inlineCode(value: string): string {
  const normalized = normalizedText(value);
  const longest = Math.max(0, ...(normalized.match(/`+/g) ?? []).map((run) => run.length));
  if (longest === 0) return `\`${normalized}\``;
  const fence = "`".repeat(longest + 1);
  return `${fence} ${normalized} ${fence}`;
}

function label(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (item) => item.toUpperCase());
}

function itemText(value: unknown): string {
  if (typeof value === "string") return safeText(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return safeText(JSON.stringify(value));
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${safeText(label(key))}: ${safeText(typeof item === "string" ? item : JSON.stringify(item))}`)
    .join("; ");
}

function bullets(values: unknown[] | string[], empty: string): string[] {
  return values.length === 0 ? [`- ${empty}`] : values.map((value) => `- ${itemText(value)}`);
}

function formattedBullets(values: string[], empty: string): string[] {
  return values.length === 0 ? [`- ${empty}`] : values.map((value) => `- ${value}`);
}

function teamsChange(change: UpstreamChange): string {
  if (change.status === "renamed") return `Renamed ${inlineCode(change.oldPath ?? "unknown")} to ${inlineCode(change.newPath ?? "unknown")}.`;
  const file = change.newPath ?? change.oldPath ?? "unknown";
  return `${label(change.status)} ${inlineCode(file)}${change.binary ? " (binary file)" : ""}.`;
}

function triggerLines(result: SyncResult): string[] {
  if (result.previousUpstreamCommit === null) return ["- First tracked synchronization; no earlier sync state exists."];
  const values = result.changedComponents.map((component) =>
    TRIGGER_DESCRIPTIONS[component] ?? `Sync input ${inlineCode(component)} changed.`);
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- The tracked sync input changed."];
}

function validationLines(result: SyncResult): string[] {
  const checks = result.validation?.checks;
  return CHECKS.map((check) => {
    const status = checks?.[check.key] ? "Passed" : "Failed";
    return `- **${status} — ${check.title}:** ${check.description}`;
  });
}

function policyLines(result: SyncResult): string[] {
  if (result.migrationPolicies.length === 0) return ["- No migration policy was applied."];
  return result.migrationPolicies.flatMap((policy) => [
    `- ${inlineCode(policy.key)} — ${safeText(policy.instruction)}`,
    `  - Reason: ${safeText(policy.rationale)}`,
    `  - Source: ${safeText(policy.source)}`,
  ]);
}

export function prBody(result: SyncResult): string {
  const agent = result.agent;
  const external = [
    ...(agent?.manifestReport.externalSetup ?? []),
    ...(result.validation?.externalValidationRequired ?? []),
  ];
  const teamsRepositorySection = result.previousUpstreamCommit === null
    ? ["### Teams repository baseline", "", "- Recorded the current sample snapshot for the first tracked synchronization."]
    : ["### Teams repository changes detected", "", ...formattedBullets(result.upstreamChanges.map(teamsChange), "No Teams repository file change was reported.")];
  return [
    "> [!IMPORTANT]",
    "> Automated draft for one sample. Review sample behavior, manifest permissions, and external setup before merge.",
    "",
    "## Description",
    "",
    `Synchronizes ${inlineCode(result.sample)} from [OfficeDev/Microsoft-Teams-Samples](https://github.com/OfficeDev/Microsoft-Teams-Samples), the Teams samples repository, to the Agents repository.`,
    "",
    "### Why this PR was created",
    "",
    ...triggerLines(result),
    "",
    "## What changed",
    "",
    safeText(agent?.summary ?? "No agent summary is available."),
    "",
    ...teamsRepositorySection,
    "",
    "### Migration adaptations",
    "",
    ...bullets(agent?.upstreamChanges ?? [], "No semantic adaptation was reported."),
    "",
    "### Preserved Agents behavior",
    "",
    ...bullets(agent?.preservedDifferences ?? [], "No intentional Agents-specific difference was reported."),
    "",
    "### Manifest adaptation",
    "",
    ...bullets(agent?.manifestReport.changes ?? [], "No manifest change was reported."),
    ...bullets(agent?.manifestReport.validation ?? [], "No manifest analysis was reported."),
    "",
    "### Files changed in the Agents repository",
    "",
    ...formattedBullets((result.destinationChanges ?? []).map(inlineCode), "No file list is available."),
    "",
    "## Applied migration policies",
    "",
    ...policyLines(result),
    "",
    "## Validation",
    "",
    ...validationLines(result),
    "",
    "## Manual validation and setup",
    "",
    ...bullets(external, "No additional item was reported."),
    "",
    "Credentialed Teams, Entra, Graph, Azure Bot, and portal behavior is not tested by this workflow.",
    "",
    "<details>",
    "<summary>Traceability</summary>",
    "",
    `- Previous Teams repository commit: ${inlineCode(result.previousUpstreamCommit ?? "none; first tracked synchronization")}`,
    `- Teams repository commit: ${inlineCode(result.upstreamCommit)}`,
    `- Teams sample tree digest: ${inlineCode(result.sourceTree)}`,
    `- Validated Agents output digest: ${inlineCode(result.outputDigest ?? "not produced")}`,
    "",
    "</details>",
    "",
  ].join("\n");
}

export function workflowSummary(result: SyncResult): string {
  const request = result.agent?.policyRequest;
  if (!request) return `### ${result.sample}: ${result.status}\n\n${result.agent?.summary ?? result.error ?? ""}\n`;
  return [
    `### ${result.sample}: needs policy`,
    "",
    `**Question:** ${request.question}`,
    "",
    `**Recommendation:** ${request.recommendation}`,
    "",
    `**Evidence:** ${request.evidence}`,
    "",
    `**Impact:** ${request.impact}`,
    "",
    "Suggested reviewed policy:",
    "",
    "```yaml",
    `- key: ${request.key}`,
    `  sample: ${result.sample}`,
    `  instruction: ${JSON.stringify(request.suggestedPolicy.instruction)}`,
    `  rationale: ${JSON.stringify(request.suggestedPolicy.rationale)}`,
    "  source: <reviewed issue or pull request>",
    "```",
    "",
  ].join("\n");
}
