import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { record, relativePath, SyncError, text } from "./config.js";
import { hash, stable } from "./git.js";
import type { AgentResult, ChangeDisposition, ManifestCapabilityDecision, ReviewResult, SyncContext } from "./types.js";

function list(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new SyncError(`${name} must be a nonempty string list`);
  if (new Set(value).size !== value.length) throw new SyncError(`${name} contains duplicates`);
  return value as string[];
}
function objects(value: unknown, name: string): unknown[] { if (!Array.isArray(value)) throw new SyncError(`${name} must be a list`); return value; }
function concreteManifestPath(value: string): boolean { return /^[A-Za-z_$][A-Za-z0-9_$-]*(?:(?:\.[A-Za-z_$][A-Za-z0-9_$-]*)|(?:\[\d+\]))*$/.test(value); }

export function parseDispositions(value: unknown): ChangeDisposition[] {
  if (!Array.isArray(value)) throw new SyncError("dispositions must be a list");
  const result = value.map((raw) => {
    const item = record(raw, "disposition"); const decision = text(item.decision, "disposition.decision");
    if (!["adapted", "already-present", "not-applicable", "blocked"].includes(decision)) throw new SyncError("Invalid disposition decision");
    return { changeId: text(item.changeId, "disposition.changeId"), decision: decision as ChangeDisposition["decision"], explanation: text(item.explanation, "disposition.explanation"), destinationPath: text(item.destinationPath, "disposition.destinationPath"), symbol: text(item.symbol, "disposition.symbol"), verification: text(item.verification, "disposition.verification") };
  });
  if (new Set(result.map((item) => item.changeId)).size !== result.length) throw new SyncError("dispositions contain duplicate source IDs");
  return result;
}

export function parseManifestCapabilities(value: unknown, allowEmpty = false): ManifestCapabilityDecision[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new SyncError("manifest capability inventory must be a nonempty list");
  const result = value.map((raw) => {
    const item = record(raw, "manifest capability"); const decision = text(item.decision, "manifest capability.decision");
    if (!["manifest-field-required", "no-manifest-field", "needs-input", "unsupported"].includes(decision)) throw new SyncError("Invalid manifest capability decision");
    const capability: ManifestCapabilityDecision = { id: text(item.id, "manifest capability.id").toLowerCase(), kind: text(item.kind, "manifest capability.kind"), evidence: list(item.evidence, "manifest capability.evidence"), decision: decision as ManifestCapabilityDecision["decision"], manifestPath: text(item.manifestPath, "manifest capability.manifestPath"), reference: text(item.reference, "manifest capability.reference") };
    if (!/^[a-z0-9][a-z0-9:._-]*$/.test(capability.id)) throw new SyncError("manifest capability.id must be lowercase and stable");
    if (capability.evidence.length === 0) throw new SyncError(`Manifest capability ${capability.id} requires source evidence`);
    if (capability.reference === "none") throw new SyncError(`Manifest capability ${capability.id} requires a skill reference`);
    if (capability.decision === "manifest-field-required" && !concreteManifestPath(capability.manifestPath)) throw new SyncError(`Manifest capability ${capability.id} requires a concrete manifestPath`);
    if (capability.decision !== "manifest-field-required" && capability.manifestPath !== "none") throw new SyncError(`Manifest capability ${capability.id} requires manifestPath none; received ${JSON.stringify(capability.manifestPath)}. Set manifestPath to the literal string "none" for decision ${capability.decision}.`);
    return capability;
  });
  if (new Set(result.map((item) => item.id)).size !== result.length) throw new SyncError("manifest capability inventory contains duplicate IDs");
  return result;
}

export function parseAgentResult(value: unknown, sample: string): AgentResult {
  const item = record(value, "agent result");
  if (item.version !== 2 || item.sample !== sample || !["updated", "unchanged", "needs-policy", "unsupported"].includes(String(item.status))) throw new SyncError("Agent result has invalid version, sample, or status");
  const manifest = record(item.manifestReport, "agent result.manifestReport");
  const result: AgentResult = { version: 2, sample, status: item.status as AgentResult["status"], summary: text(item.summary, "agent result.summary"), dispositions: parseDispositions(item.dispositions), upstreamChanges: objects(item.upstreamChanges, "agent result.upstreamChanges"), preservedDifferences: objects(item.preservedDifferences, "agent result.preservedDifferences"), appliedPolicies: list(item.appliedPolicies, "agent result.appliedPolicies"), manifestReport: { mode: text(manifest.mode, "manifestReport.mode"), changes: objects(manifest.changes, "manifestReport.changes"), validation: objects(manifest.validation, "manifestReport.validation"), externalSetup: objects(manifest.externalSetup, "manifestReport.externalSetup"), capabilities: parseManifestCapabilities(manifest.capabilities, item.status === "needs-policy" || item.status === "unsupported") } };
  if (result.status === "needs-policy") {
    const request = record(item.policyRequest, "agent result.policyRequest"); const suggestion = record(request.suggestedPolicy, "agent result.policyRequest.suggestedPolicy");
    result.policyRequest = { key: text(request.key, "policyRequest.key"), question: text(request.question, "policyRequest.question"), recommendation: text(request.recommendation, "policyRequest.recommendation"), evidence: text(request.evidence, "policyRequest.evidence"), impact: text(request.impact, "policyRequest.impact"), suggestedPolicy: { instruction: text(suggestion.instruction, "suggestedPolicy.instruction"), rationale: text(suggestion.rationale, "suggestedPolicy.rationale") } };
  }
  return result;
}

function jsonPathExists(value: unknown, expression: string): boolean {
  const tokens = [...expression.matchAll(/(?:^|\.)([^.\[\]]+)|\[(\d+)\]/g)].map((match) => match[1] ?? Number(match[2]));
  let current = value; for (const token of tokens) { if (typeof token === "number") { if (!Array.isArray(current) || current[token] === undefined) return false; current = current[token]; } else { if (!current || typeof current !== "object" || !(token in current)) return false; current = (current as Record<string, unknown>)[token]; } }
  return current !== undefined && current !== null;
}

export function evidenceDigest(result: AgentResult): string { return hash(stable(result)); }

export function coverageErrors(repo: string, context: SyncContext, agent: AgentResult): string[] {
  const errors: string[] = []; const expected = context.changes.map((change) => change.id); const actual = agent.dispositions.map((item) => item.changeId);
  const policyKeys = context.policies.map((policy) => policy.key);
  if (agent.appliedPolicies.some((key) => !policyKeys.includes(key)) ||
      (["updated", "unchanged"].includes(agent.status) && policyKeys.some((key) => !agent.appliedPolicies.includes(key)))) {
    errors.push("Applied policies must match the configured policy keys exactly");
  }
  if (!["updated", "unchanged"].includes(agent.status)) return errors;
  if (expected.some((id) => !actual.includes(id)) || actual.some((id) => !expected.includes(id))) errors.push("Account for each source change ID exactly once");
  for (const item of agent.dispositions) {
    if (item.decision === "blocked") errors.push(`Unresolved source change: ${item.changeId}`);
    if (["adapted", "already-present"].includes(item.decision)) {
      const reason = !relativePath(item.destinationPath) ? "path must be repository-relative with forward slashes" : !item.destinationPath.startsWith(`${context.paths.destination}/`) ? `path must be inside ${context.paths.destination}/` : !existsSync(path.join(repo, item.destinationPath)) ? "file does not exist" : undefined;
      if (reason) errors.push(`Invalid destination evidence: ${item.changeId}; received ${JSON.stringify(item.destinationPath)}: ${reason}. Set destinationPath to the actual existing destination file, including ${context.paths.destination}/. If the source was intentionally not ported, use not-applicable with an explanation instead of claiming adapted/already-present.`);
    }
  }
  if (agent.manifestReport.mode !== "complete" || agent.manifestReport.validation.length === 0) errors.push("Complete the manifest skill assessment");
  const manifestFile = path.join(repo, context.paths.destination, context.manifest.packageDirectory, "manifest.json");
  let manifest: unknown; try { manifest = JSON.parse(readFileSync(manifestFile, "utf8")); } catch { errors.push("Cannot verify capability inventory against manifest JSON"); }
  for (const capability of agent.manifestReport.capabilities) {
    if (capability.decision === "manifest-field-required" && manifest !== undefined && !jsonPathExists(manifest, capability.manifestPath)) errors.push(`Manifest capability path does not exist: ${capability.id} -> ${capability.manifestPath}`);
    if (["needs-input", "unsupported"].includes(capability.decision) && ["updated", "unchanged"].includes(agent.status)) errors.push(`Unresolved manifest capability: ${capability.id}`);
  }
  return errors;
}

export function parseReview(value: unknown, sample: string, expectedChangeIds: string[], expectedCapabilityIds: string[], previousFindingIds: string[] = []): ReviewResult {
  const item = record(value, "review"); if (item.version !== 2 || item.sample !== sample || !["approved", "changes-required", "blocked"].includes(String(item.verdict))) throw new SyncError("Invalid review envelope");
  const reviewedChangeIds = list(item.reviewedChangeIds, "reviewedChangeIds"); const reviewedCapabilityIds = list(item.reviewedCapabilityIds, "reviewedCapabilityIds");
  const sameIds = (actual: string[], expected: string[]) => actual.length === expected.length && expected.every((id) => actual.includes(id));
  if (!sameIds(reviewedChangeIds, expectedChangeIds) || !sameIds(reviewedCapabilityIds, expectedCapabilityIds)) throw new SyncError("Reviewer must account for every source change and capability ID exactly once");
  if (!Array.isArray(item.findings)) throw new SyncError("Review findings must be a list");
  const findings = item.findings.map((raw) => { const finding = record(raw, "finding"); const category = text(finding.category, "finding.category"); if (!["code", "manifest", "test", "evidence"].includes(category)) throw new SyncError("Invalid finding category"); return { id: text(finding.id, "finding.id"), category: category as "code" | "manifest" | "test" | "evidence", source: text(finding.source, "finding.source"), destination: text(finding.destination, "finding.destination"), expectedBehavior: text(finding.expectedBehavior, "finding.expectedBehavior"), correction: text(finding.correction, "finding.correction") }; });
  const resolvedFindingIds = list(item.resolvedFindingIds, "resolvedFindingIds"); const ids = findings.map((finding) => finding.id);
  if (new Set(ids).size !== ids.length || resolvedFindingIds.some((id) => ids.includes(id) || !previousFindingIds.includes(id)) || previousFindingIds.some((id) => !ids.includes(id) && !resolvedFindingIds.includes(id))) throw new SyncError("Reviewer must resolve or retain every previous finding");
  if ((item.verdict === "approved" && findings.length !== 0) || (item.verdict === "changes-required" && findings.length === 0)) throw new SyncError("Approval requires no findings; changes-required requires actionable findings");
  if (item.verdict === "blocked" && typeof item.blockerReason !== "string") throw new SyncError("Blocked review requires blockerReason");
  const result: ReviewResult = { version: 2, sample, verdict: item.verdict as ReviewResult["verdict"], summary: text(item.summary, "review.summary"), reviewedChangeIds, reviewedCapabilityIds, findings, resolvedFindingIds, testAssessment: text(item.testAssessment, "review.testAssessment"), coverageLimitations: list(item.coverageLimitations, "review.coverageLimitations") };
  if (item.blockerReason !== undefined) result.blockerReason = text(item.blockerReason, "review.blockerReason");
  return result;
}
