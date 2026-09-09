import { assertFullValidation } from "./validate.js";
import { SyncError } from "./config.js";
import { evidenceDigest, parseAgentResult, parseReview } from "./review.js";
import type { AgentResult, AgentEvent, ReviewApproval, ReviewResult, SyncMetrics, SyncStage, ValidationResult } from "./types.js";

export interface PersistentSession { send(message: string): Promise<unknown>; close(): Promise<void>; abort?(): Promise<void>; }
export interface CoordinatorOptions {
  sample: string; contextFile: string; sourceChangeIds: string[]; policyKeys: string[]; deadlineMs?: number;
  createImplementation: () => Promise<PersistentSession>; createReviewer: () => Promise<PersistentSession>;
  validate: (group: "code" | "manifest" | "all") => Promise<ValidationResult>; outputDigest: () => string;
  cancelValidation?: () => Promise<void> | void;
  coverage: (agent: AgentResult) => string[]; event?: (event: AgentEvent) => void;
}
export interface CoordinatorResult { agent: AgentResult; validation?: ValidationResult; review?: ReviewApproval; evidenceDigest: string; stage: SyncStage; metrics: SyncMetrics; }
const budgets = { repairs: 2, reportRejections: 2, deadline: 30 * 60_000 };

export async function runSyncSession(options: CoordinatorOptions): Promise<CoordinatorResult> {
  const metrics: SyncMetrics = { repairPasses: 0, rejectedImplementerReports: 0, rejectedReviewerReports: 0 };
  let stage: SyncStage = "preflight";
  let implementation: PersistentSession | undefined;
  let reviewer: PersistentSession | undefined;
  let expired = false;
  const event = (type: string, detail: Record<string, unknown> = {}): void => options.event?.({ at: new Date().toISOString(), stage, type, detail });
  const enter = (next: SyncStage): void => { stage = next; event("stage-start"); };
  let rejectDeadline: (error: Error) => void = () => {};
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  // Handle a deadline even while no agent tool is being called.
  const timer = setTimeout(() => {
    expired = true;
    rejectDeadline(new SyncError("Per-sample migration deadline exceeded"));
    void Promise.allSettled([implementation?.abort?.(), reviewer?.abort?.(), options.cancelValidation?.()]);
  }, options.deadlineMs ?? budgets.deadline);
  const bounded = <T>(operation: Promise<T>): Promise<T> => Promise.race([operation, deadline]);
  const send = (session: PersistentSession, message: string): Promise<unknown> => bounded(session.send(message));
  let lastFailure: string | undefined;
  let repeatedFailures = 0;
  const acceptedHistory: AgentResult[] = [];

  async function acceptImplementation(initial: unknown): Promise<{ agent: AgentResult; validation?: ValidationResult }> {
    let raw = initial;
    let rejected = 0;
    let previousRejected: string | undefined;
    let idle = false;
    for (;;) {
      if (raw === undefined || raw === null) {
        if (idle) throw new SyncError("Implementation session remained idle without submit_result");
        idle = true;
        raw = await send(implementation!, "Completion is unmet: use submit_result with the current evidence, or a structured blocker. Do not repeat migration.");
        continue;
      }
      idle = false;
      let agent: AgentResult;
      try {
        agent = parseAgentResult(raw, options.sample);
        if (!["needs-policy", "unsupported"].includes(agent.status)) {
          const errors = options.coverage(agent);
          const unknown = agent.appliedPolicies.filter((key) => !options.policyKeys.includes(key));
          if (unknown.length) errors.push(`Unknown policy keys: ${unknown.join(", ")}`);
          if (errors.length) throw new SyncError(errors.join("\n"));
        }
      } catch (error) {
        const signature = JSON.stringify(raw);
        rejected = signature === previousRejected ? rejected + 1 : 1;
        previousRejected = signature;
        metrics.rejectedImplementerReports++;
        if (rejected >= budgets.reportRejections) throw new SyncError(`Repeated implementation evidence rejection without progress: ${String(error)}`);
        event("submission-rejected", { role: "implementation", error: String(error) });
        raw = await send(implementation!, `Correct only your evidence submission; no code changes are requested. ${String(error)}`);
        continue;
      }
      if (["needs-policy", "unsupported"].includes(agent.status)) return { agent };
      const validation = await bounded(options.validate("all"));
      event("validation", { validation });
      if (validation.outputDigest !== options.outputDigest()) throw new SyncError("Validation returned a stale candidate digest");
      if (validation.group === "all" && validation.passed) {
        assertFullValidation(validation, options.sample);
        lastFailure = undefined; repeatedFailures = 0;
        acceptedHistory.push(agent);
        event("implementation-accepted", { evidenceDigest: evidenceDigest(agent), evidence: agent });
        return { agent, validation };
      }
      if (!validation.repairable) throw new SyncError(`Validation infrastructure failure: ${validation.errors.join("\n")}`);
      const signature = JSON.stringify([validation.outputDigest, [...validation.errors].sort()]);
      repeatedFailures = signature === lastFailure ? repeatedFailures + 1 : 1;
      lastFailure = signature;
      if (repeatedFailures >= 2) throw new SyncError("Repeated corrective validation without candidate or diagnostic progress");
      raw = await send(implementation!, `Correct the specific deterministic defects below, revalidate, and submit_result. Current validation: ${JSON.stringify(validation)}`);
    }
  }

  try {
    enter("preflight");
    implementation = await bounded(options.createImplementation().then(async (session) => { if (expired) await session.close(); return session; }));
    const stages = {
      inspect: "Inspect the exact source change IDs and required behavior before editing; for an initial import inspect every inventoried source file. Preserve existing Agents-owned differences.",
      "migrate-code": "Invoke the registered migration skill. Adapt required source behavior with the smallest necessary changes, add meaningful sample tests, and validate code using validate_sample group code.",
      "reconcile-manifest": "Invoke the registered manifest skill even if a manifest exists. Reconcile the manifest with implemented behavior, inspect released schema as needed, and validate group manifest. Preserve a valid complete manifest.",
    } as const;
    for (const next of ["inspect", "migrate-code", "reconcile-manifest"] as const) {
      enter(next);
      const response = await send(implementation!, `Stage ${stage}. Read source context ${options.contextFile}. ${stages[next]}`);
      if (response && typeof response === "object" && ["needs-policy", "unsupported"].includes(String((response as Record<string, unknown>).status))) {
        const agent = parseAgentResult(response, options.sample); enter("blocked");
        return { agent, evidenceDigest: evidenceDigest(agent), stage, metrics };
      }
    }
    enter("validate");
    let accepted = await acceptImplementation(await send(implementation!, "Run validate_sample group all, then submit_result with complete current implementation evidence."));
    let previousFindingIds: string[] = [];
    let previousFindings: ReviewResult["findings"] = [];
    for (;;) {
      const { agent, validation } = accepted;
      const currentEvidenceDigest = evidenceDigest(agent);
      if (!validation) { enter("blocked"); return { agent, evidenceDigest: currentEvidenceDigest, stage, metrics }; }
      enter("review");
      reviewer ??= await bounded(options.createReviewer().then(async (session) => { if (expired) await session.close(); return session; }));
      const reviewInput = { sourceContextFile: options.contextFile, expectedSourceChangeIds: options.sourceChangeIds, currentImplementationEvidence: agent, currentValidation: validation, evidenceDigest: currentEvidenceDigest, openFindings: previousFindings, supersededImplementationEvidence: acceptedHistory.slice(0, -1) };
      let raw = await send(reviewer!, `Independently inspect the source and candidate, then review this current evidence. Historical evidence is superseded; inspect material changes and removals. Submit_review with complete IDs. ${JSON.stringify(reviewInput)}`);
      let review: ReviewResult;
      let idle = false;
      let rejected = 0;
      let lastRejected: string | undefined;
      for (;;) {
        if (raw === undefined || raw === null) {
          if (idle) throw new SyncError("Review session remained idle without submit_review");
          idle = true; raw = await send(reviewer!, "Completion is unmet: submit_review for the supplied current evidence and validation."); continue;
        }
        try { review = parseReview(raw, options.sample, options.sourceChangeIds, agent.manifestReport.capabilities.map((capability) => capability.id), previousFindingIds); break; }
        catch (error) {
          const signature = JSON.stringify(raw); rejected = signature === lastRejected ? rejected + 1 : 1; lastRejected = signature;
          metrics.rejectedReviewerReports++;
          if (rejected >= budgets.reportRejections) throw new SyncError(`Repeated review evidence rejection without progress: ${String(error)}`);
          raw = await send(reviewer!, `Correct only the review submission. ${String(error)}`);
        }
      }
      if (options.outputDigest() !== validation.outputDigest || evidenceDigest(agent) !== currentEvidenceDigest) throw new SyncError("Candidate or evidence changed during review");
      const approval: ReviewApproval = { result: review, outputDigest: validation.outputDigest, evidenceDigest: currentEvidenceDigest, validationId: validation.id };
      event("review-accepted", { approval });
      if (review.verdict === "approved" || review.verdict === "blocked") {
        enter(review.verdict === "approved" ? "complete" : "blocked");
        return { agent, validation, review: approval, evidenceDigest: currentEvidenceDigest, stage, metrics };
      }
      if (metrics.repairPasses >= budgets.repairs) throw new SyncError("Post-review repair budget exhausted");
      enter("repair"); metrics.repairPasses++;
      previousFindingIds = review.findings.map((finding) => finding.id); previousFindings = review.findings;
      accepted = await acceptImplementation(await send(implementation!, `Resolve these concrete findings. Evidence-only findings request evidence correction, not code changes. Verify schema/source evidence before acting on conflicting suggestions. Revalidate and submit_result. ${JSON.stringify(review.findings)}`));
    }
  } finally {
    clearTimeout(timer);
    await Promise.allSettled([implementation?.close(), reviewer?.close()]);
  }
}
