import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { record, text, relativePath, SyncError } from "./config.js";
import type { AgentResult, CapabilityAssessment, ChangeDisposition, ExpectedCapabilityRevision, ManifestCapabilityDecision, ReviewResult, SyncContext } from "./types.js";

function list(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !v.trim())) {
    throw new SyncError(name + " must be a string list");
  }
  if (new Set(value).size !== value.length) throw new SyncError(name + " contains duplicates");
  return value as string[];
}

export function parseDispositions(value: unknown): ChangeDisposition[] {
  if (!Array.isArray(value)) throw new SyncError("dispositions must be a list");
  return value.map((raw) => {
    const item = record(raw, "disposition");
    const decision = text(item.decision, "decision");
    if (!["adapted", "already-present", "not-applicable", "blocked"].includes(decision)) {
      throw new SyncError("Invalid disposition decision");
    }
    return {
      changeId: text(item.changeId, "changeId"), decision: decision as ChangeDisposition["decision"],
      explanation: text(item.explanation, "explanation"),
      destinationPath: text(item.destinationPath, "destinationPath"),
      symbol: text(item.symbol, "symbol"), verification: text(item.verification, "verification"),
    };
  });
}

export function parseManifestCapabilities(value: unknown): ManifestCapabilityDecision[] {
  if (!Array.isArray(value) || value.length === 0) throw new SyncError("manifest capability ledger must be a nonempty list");
  const result = value.map((raw) => {
    const item = record(raw, "manifest capability");
    const decision = text(item.decision, "manifest capability.decision");
    if (!["manifest-field-required", "no-manifest-field", "needs-input", "unsupported"].includes(decision)) {
      throw new SyncError("Invalid manifest capability decision");
    }
    const capability: ManifestCapabilityDecision = {
      id: text(item.id, "manifest capability.id"), kind: text(item.kind, "manifest capability.kind"),
      evidence: list(item.evidence, "manifest capability.evidence"),
      decision: decision as ManifestCapabilityDecision["decision"],
      manifestPath: text(item.manifestPath, "manifest capability.manifestPath"),
      reference: text(item.reference, "manifest capability.reference"),
    };
    if (!/^[a-z0-9][a-z0-9:._-]*$/.test(capability.id)) throw new SyncError("manifest capability.id must be lowercase and stable");
    if (capability.evidence.length === 0) throw new SyncError(`Manifest capability ${capability.id} requires source evidence`);
    if (capability.reference === "none") throw new SyncError(`Manifest capability ${capability.id} requires a manifest-skill reference`);
    if (decision === "manifest-field-required" && capability.manifestPath === "none") {
      throw new SyncError(`Manifest capability ${capability.id} requires a concrete manifestPath`);
    }
    if (decision !== "manifest-field-required" && capability.manifestPath !== "none") {
      throw new SyncError(`Manifest capability ${capability.id} with decision ${decision} requires manifestPath none`);
    }
    return capability;
  });
  if (new Set(result.map((item) => item.id)).size !== result.length) throw new SyncError("manifest capability ledger contains duplicate IDs");
  return result;
}

export function parseCapabilityAssessment(value: unknown, sample: string): CapabilityAssessment {
  const item = record(value, "capability assessment");
  if (item.version !== 1 || item.sample !== sample) throw new SyncError("Invalid capability assessment envelope");
  return {
    version: 1,
    sample,
    summary: text(item.summary, "capability assessment.summary"),
    capabilities: parseManifestCapabilities(item.capabilities),
  };
}

function parseExpectedCapabilityRevisions(value: unknown): ExpectedCapabilityRevision[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new SyncError("expectedCapabilityRevisions must be a list");
  const revisions = value.map((raw) => {
    const item = record(raw, "expected capability revision");
    const decision = text(item.decision, "expected capability revision.decision");
    if (!["manifest-field-required", "no-manifest-field", "needs-input", "unsupported"].includes(decision)) {
      throw new SyncError("Invalid expected capability revision decision");
    }
    const manifestPath = text(item.manifestPath, "expected capability revision.manifestPath");
    if ((decision === "manifest-field-required") === (manifestPath === "none")) {
      throw new SyncError("Expected capability revision has inconsistent manifestPath");
    }
    return {
      id: text(item.id, "expected capability revision.id"),
      decision: decision as ExpectedCapabilityRevision["decision"],
      manifestPath,
      explanation: text(item.explanation, "expected capability revision.explanation"),
      evidence: list(item.evidence, "expected capability revision.evidence"),
      reference: text(item.reference, "expected capability revision.reference"),
    };
  });
  if (new Set(revisions.map((item) => item.id)).size !== revisions.length) {
    throw new SyncError("expectedCapabilityRevisions contains duplicate IDs");
  }
  if (revisions.some((item) => item.evidence.length === 0 || item.reference === "none")) {
    throw new SyncError("Expected capability revisions require evidence and a manifest-skill reference");
  }
  return revisions;
}

function jsonPathExists(value: unknown, expression: string): boolean {
  if (!expression || expression === "none") return false;
  const tokens = [...expression.matchAll(/(?:^|\.)([^.\[\]]+)|\[(\d+)\]/g)]
    .map((match) => match[1] ?? Number(match[2]));
  if (tokens.length === 0) return false;
  let current: unknown = value;
  for (const token of tokens) {
    if (typeof token === "number") {
      if (!Array.isArray(current) || token >= current.length) return false;
      current = current[token];
    } else {
      if (!current || typeof current !== "object" || !(token in current)) return false;
      current = (current as Record<string, unknown>)[token];
    }
  }
  return current !== undefined && current !== null;
}

export function coverageErrors(repo: string, context: SyncContext, agent: AgentResult): string[] {
  const errors: string[] = [];
  const expected = context.changes.map((change) => change.id);
  const dispositions = agent.dispositions ?? [];
  const actual = dispositions.map((item) => item.changeId);
  if (new Set(actual).size !== actual.length || expected.some((id) => !actual.includes(id)) ||
      actual.some((id) => !expected.includes(id))) errors.push("Account for each source change ID exactly once");
  for (const item of dispositions) {
    if (item.decision === "blocked") errors.push("Unresolved source change: " + item.changeId);
    if (item.decision === "adapted" || item.decision === "already-present") {
      if (!relativePath(item.destinationPath) || !item.destinationPath.startsWith(context.paths.destination + "/") ||
          !existsSync(path.join(repo, item.destinationPath))) errors.push("Invalid destination evidence: " + item.changeId);
    }
  }
  if (agent.manifestReport.mode !== "complete" || agent.manifestReport.validation.length === 0) {
    errors.push("Complete the manifest skill assessment; schema validity alone is not completeness");
  }
  const manifestFile = path.join(repo, context.paths.destination, context.manifest.packageDirectory, "manifest.json");
  if (!existsSync(manifestFile)) errors.push("The selected sample must contain appManifest/manifest.json after manifest reconciliation");
  else {
    let manifest: unknown;
    try { manifest = JSON.parse(readFileSync(manifestFile, "utf8")); }
    catch { errors.push("Cannot verify capability ledger against invalid manifest JSON"); }
    if (manifest !== undefined) {
      for (const capability of agent.manifestReport.capabilities) {
        if (capability.decision === "manifest-field-required" && !jsonPathExists(manifest, capability.manifestPath)) {
          errors.push(`Manifest capability path does not exist: ${capability.id} -> ${capability.manifestPath}`);
        }
        if (capability.decision === "needs-input") {
          errors.push(`Manifest capability remains unresolved: ${capability.id}`);
        }
        if (capability.decision === "unsupported" && ["updated", "unchanged"].includes(agent.status)) {
          errors.push(`Required manifest capability is unsupported: ${capability.id}`);
        }
      }
    }
  }
  return errors;
}

export function manifestReviewErrors(agent: AgentResult, review: ReviewResult, assessment?: CapabilityAssessment): string[] {
  const expected = new Map(agent.manifestReport.capabilities.map((item) => [item.id, item]));
  const actual = new Map(review.manifestCapabilities.map((item) => [item.id, item]));
  const errors: string[] = [];
  for (const id of new Set([...expected.keys(), ...actual.keys()])) {
    const implementation = expected.get(id); const assessment = actual.get(id);
    if (!implementation || !assessment) { errors.push(`Reviewer manifest capability inventory differs for ${id}`); continue; }
    if (implementation.decision !== assessment.decision ||
        implementation.manifestPath !== assessment.manifestPath) {
      errors.push(`Reviewer manifest capability assessment differs for ${id}`);
    }
  }
  if (assessment) {
    const revisions = new Map((review.expectedCapabilityRevisions ?? []).map((item) => [item.id, item]));
    for (const revision of revisions.values()) {
      if (!assessment.capabilities.some((item) => item.id === revision.id)) {
        errors.push(`Reviewer revised unknown expected manifest capability ${revision.id}`);
      }
    }
    for (const baseline of assessment.capabilities) {
      const revision = revisions.get(baseline.id);
      const decision = revision?.decision ?? baseline.decision;
      const manifestPath = revision?.manifestPath ?? baseline.manifestPath;
      const implementation = expected.get(baseline.id);
      const finalReview = actual.get(baseline.id);
      if (!implementation || implementation.decision !== decision || implementation.manifestPath !== manifestPath) {
        errors.push(`Implementation does not satisfy expected manifest capability ${baseline.id}`);
      }
      if (!finalReview || finalReview.decision !== decision || finalReview.manifestPath !== manifestPath) {
        errors.push(`Final review does not satisfy expected manifest capability ${baseline.id}`);
      }
    }
  }
  return errors;
}

export function parseReview(value: unknown, sample: string, expectedIds: string[], previousFindingIds: string[] = []): ReviewResult {
  const item = record(value, "review");
  if (item.version !== 1 || item.sample !== sample ||
      !["approved", "changes-required", "blocked"].includes(String(item.verdict))) throw new SyncError("Invalid review envelope");
  const reviewedChangeIds = list(item.reviewedChangeIds, "reviewedChangeIds");
  if (expectedIds.some((id) => !reviewedChangeIds.includes(id)) || reviewedChangeIds.some((id) => !expectedIds.includes(id))) {
    throw new SyncError("Reviewer must account for every source change");
  }
  if (!Array.isArray(item.findings)) throw new SyncError("Review findings must be a list");
  const findings = item.findings.map((raw) => {
    const finding = record(raw, "finding");
    return { id: text(finding.id, "finding.id"), source: text(finding.source, "finding.source"),
      destination: text(finding.destination, "finding.destination"),
      expectedBehavior: text(finding.expectedBehavior, "finding.expectedBehavior"),
      correction: text(finding.correction, "finding.correction") };
  });
  const ids = findings.map((f) => f.id);
  const resolvedFindingIds = list(item.resolvedFindingIds, "resolvedFindingIds");
  if (new Set(ids).size !== ids.length || resolvedFindingIds.some((id) => ids.includes(id) || !previousFindingIds.includes(id)) ||
      previousFindingIds.some((id) => !ids.includes(id) && !resolvedFindingIds.includes(id))) {
    throw new SyncError("Reviewer must resolve or retain each previous finding");
  }
  if ((item.verdict === "approved") !== (findings.length === 0)) {
    throw new SyncError("Only a review without blocking findings can approve");
  }
  return { version: 1, sample, verdict: item.verdict as ReviewResult["verdict"],
    summary: text(item.summary, "review.summary"), reviewedChangeIds, findings, resolvedFindingIds,
    manifestAssessment: text(item.manifestAssessment, "manifestAssessment"),
    manifestCapabilities: parseManifestCapabilities(item.manifestCapabilities),
    expectedCapabilityRevisions: parseExpectedCapabilityRevisions(item.expectedCapabilityRevisions),
    testAssessment: text(item.testAssessment, "testAssessment") };
}
