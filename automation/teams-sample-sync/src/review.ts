import { existsSync } from "node:fs";
import path from "node:path";
import { record, text, relativePath, SyncError } from "./config.js";
import type { AgentResult, ChangeDisposition, ReviewResult, SyncContext } from "./types.js";

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
    testAssessment: text(item.testAssessment, "testAssessment") };
}
