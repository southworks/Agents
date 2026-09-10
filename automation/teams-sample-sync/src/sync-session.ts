import { writeFileSync } from "node:fs";
import path from "node:path";
import { SyncError } from "./config.js";
import { hash } from "./git.js";
import type { ImplementationSession } from "./agent-runner.js";
import type { ValidationResult } from "./types.js";
import { assertFullValidation } from "./validate.js";

export interface MigrationSessionOptions {
  sample: string; contextFile: string; output: string; session: ImplementationSession;
  validate: () => Promise<ValidationResult>; deadlineMs?: number;
}
export type MigrationOutcome = "changed" | "no-changes";
export interface MigrationSessionResult { plan: string; planHash: string; selfAudit: string; outcome: MigrationOutcome; validation: ValidationResult; repairPasses: number; }

const RESPONSE_PREVIEW_LIMIT = 400;

function responseTail(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return JSON.stringify("<empty>");
  const preview = normalized.length > RESPONSE_PREVIEW_LIMIT
    ? `…${normalized.slice(-RESPONSE_PREVIEW_LIMIT)}`
    : normalized;
  return JSON.stringify(preview);
}

function outcomeFromSelfAudit(value: string): MigrationOutcome {
  if (!/^##\s+self-audit\b/im.test(value)) {
    throw new SyncError(`Implementer response is missing required heading "## Self-audit"; the next full validation pass was not run. Response ended with: ${responseTail(value)}`);
  }
  const outcome = /^Outcome:\s*(changed|no changes required)\s*$/im.exec(value)?.[1]?.toLowerCase();
  if (outcome === "changed") return "changed";
  if (outcome === "no changes required") return "no-changes";
  throw new SyncError(`Implementer self-audit is missing required line "Outcome: changed" or "Outcome: no changes required"; the next full validation pass was not run. Response ended with: ${responseTail(value)}`);
}

export function assertOutcomeMatchesSampleChanges(outcome: MigrationOutcome, changes: string[]): void {
  if (outcome === "changed" && changes.length === 0) throw new SyncError("Implementer reported changes but the selected sample is unchanged");
  if (outcome === "no-changes" && changes.length > 0) throw new SyncError("Implementer reported no changes but the selected sample was modified");
}

export async function runMigrationSession(options: MigrationSessionOptions): Promise<MigrationSessionResult> {
  let expired = false; let rejectDeadline: (error: Error) => void = () => {};
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => { expired = true; void options.session.abort(); rejectDeadline(new SyncError("Per-sample migration deadline exceeded")); }, options.deadlineMs ?? 30 * 60_000);
  const bounded = <T>(work: Promise<T>): Promise<T> => Promise.race([work, deadline]);
  try {
    const plan = await bounded(options.session.send(`Plan only. Read source context ${options.contextFile}, inspect the existing destination sample, and invoke the migration and manifest skills. Do not edit any files. Before finalizing, reconcile user-facing capabilities across source handlers, README/help text, the destination implementation, and the actual manifest JSON. For every command, record its exact title, slash or mention surface, handler evidence, and current bots[].commandLists status. Documentation is a requirement to verify, not proof of manifest state. Return a concise Markdown migration spec headed with "## Migration plan" and one item per source behavior: upstream path and stable symbol, destination change, Agents-specific behavior to preserve, manifest impact, and validation expectation. Include every mismatch as a required change.`));
    if (!/^#{1,6}\s+.*migration\s+plan\b/im.test(plan)) throw new SyncError("Implementer did not produce a complete Markdown migration plan");
    const planHash = hash(plan); writeFileSync(path.join(options.output, "migration-plan.md"), `${plan}\n`, "utf8");
    options.session.setWriteAccess(true);
    let selfAudit = await bounded(options.session.send(`Implement the frozen migration plan ${planHash}. Use both skills, edit only the selected sample, and use validate_sample while working. Do not revise the plan. Before full validation, re-open the final handlers, README/help text, and manifest JSON and compare every command by exact title and surface under bots[].commandLists; schema validity alone is insufficient. When finished, re-read the source context, frozen plan, and final changed files. Return a terminal Markdown response headed "## Self-audit". On its own next line write exactly either "Outcome: changed" or "Outcome: no changes required", then account for every plan item and state the validation run.`));
    let outcome = outcomeFromSelfAudit(selfAudit);
    let validation = await bounded(options.validate());
    if (validation.passed) { assertFullValidation(validation, options.sample); return { plan, planHash, selfAudit, outcome, validation, repairPasses: 0 }; }
    if (!validation.repairable) throw new SyncError(`Validation infrastructure failure: ${validation.errors.join("\n")}`);
    selfAudit = await bounded(options.session.send(`The frozen plan ${planHash} remains unchanged. Repair these deterministic validation failures in the selected sample; do not explain away a semantic mismatch. Re-open the affected files, make the required correction, run full validation, then return a terminal Markdown response headed "## Self-audit" with "Outcome: changed" or "Outcome: no changes required" on its own next line, without revising the plan: ${JSON.stringify(validation.errors)}`));
    outcome = outcomeFromSelfAudit(selfAudit);
    validation = await bounded(options.validate());
    assertFullValidation(validation, options.sample);
    return { plan, planHash, selfAudit, outcome, validation, repairPasses: 1 };
  } finally { clearTimeout(timer); if (expired) await options.session.abort().catch(() => {}); }
}
