import type { SyncResult } from "./types.js";

export function prBody(result: SyncResult): string {
  const validation = result.validation;
  const checks = validation?.checks;
  const changedPaths = result.upstreamChanges.map((change) => {
    if (change.status === "renamed") return `renamed: \`${change.oldPath}\` → \`${change.newPath}\``;
    return `${change.status}: \`${change.newPath ?? change.oldPath}\`${change.binary ? " (binary)" : ""}`;
  });
  const lines = (values: unknown[] | string[], empty: string): string[] =>
    values.length === 0 ? [`- ${empty}`] : values.map((value) => `- ${typeof value === "string" ? value : JSON.stringify(value)}`);
  return [
    "## Teams sample synchronization",
    "",
    `- Sample: \`${result.sample}\``,
    `- Previous upstream commit: \`${result.previousUpstreamCommit ?? "initial import"}\``,
    `- Upstream commit: \`${result.upstreamCommit}\``,
    `- Source tree: \`${result.sourceTree}\``,
    `- Output digest: \`${result.outputDigest ?? "not produced"}\``,
    "",
    "### Upstream changed paths",
    "",
    ...lines(changedPaths, "No previous upstream state."),
    "",
    "### Semantic migration",
    "",
    `- Summary: ${result.agent?.summary ?? "not available"}`,
    ...lines(result.agent?.upstreamChanges ?? [], "No semantic behavior change reported."),
    ...lines(result.agent?.preservedDifferences ?? [], "No preserved difference reported."),
    "",
    "### Applied migration policies",
    "",
    ...lines(result.agent?.appliedPolicies ?? [], "No migration policy applied."),
    "",
    "### Manifest report (transient)",
    "",
    ...lines(result.agent?.manifestReport.changes ?? [], "No manifest change reported."),
    ...lines(result.agent?.manifestReport.validation ?? [], "No agent manifest validation reported."),
    ...lines(result.agent?.manifestReport.externalSetup ?? [], "No external manifest setup reported."),
    "",
    "### Trusted validation",
    "",
    `- Project: ${checks?.project ? "passed" : "failed"}`,
    `- Restore: ${checks?.restore ? "passed" : "failed"}`,
    `- Build: ${checks?.build ? "passed" : "failed"}`,
    `- Manifest and released schema: ${checks?.manifest ? "passed" : "failed"}`,
    `- HTTP GET / smoke: ${checks?.httpSmoke ? "passed" : "failed"}`,
    `- Protected contracts: ${checks?.contracts ? "passed" : "failed"}`,
    "",
    "### External validation",
    "",
    ...lines(validation?.externalValidationRequired ?? [], "None reported."),
    "",
    "Credentialed Teams, Entra, Graph, Azure Bot, and portal checks remain external when applicable.",
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
