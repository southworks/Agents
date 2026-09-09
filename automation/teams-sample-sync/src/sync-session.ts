import { writeFileSync } from "node:fs";
import path from "node:path";
import { SyncError } from "./config.js";
import { hash } from "./git.js";
import type { ImplementationSession } from "./agent-runner.js";
import type { ValidationResult } from "./types.js";
import { assertFullValidation } from "./validate.js";

export interface MigrationSessionOptions {
  sample: string; contextFile: string; output: string; session: ImplementationSession;
  validate: () => Promise<ValidationResult>; outputDigest: () => string; deadlineMs?: number;
}
export interface MigrationSessionResult { plan: string; planHash: string; selfAudit: string; validation: ValidationResult; repairPasses: number; }

export async function runMigrationSession(options: MigrationSessionOptions): Promise<MigrationSessionResult> {
  let expired = false; let rejectDeadline: (error: Error) => void = () => {};
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => { expired = true; void options.session.abort(); rejectDeadline(new SyncError("Per-sample migration deadline exceeded")); }, options.deadlineMs ?? 30 * 60_000);
  const bounded = <T>(work: Promise<T>): Promise<T> => Promise.race([work, deadline]);
  try {
    const plan = await bounded(options.session.send(`Plan only. Read source context ${options.contextFile}, inspect the existing destination sample, and invoke the migration and manifest skills. Do not edit any files. Return a concise Markdown migration spec with one item per source behavior: upstream path and stable symbol, destination change, Agents-specific behavior to preserve, manifest impact, and validation expectation.`));
    if (!plan) throw new SyncError("Implementer did not produce a migration plan");
    const planHash = hash(plan); writeFileSync(path.join(options.output, "migration-plan.md"), `${plan}\n`, "utf8");
    options.session.setWriteAccess(true);
    let selfAudit = await bounded(options.session.send(`Implement the frozen migration plan ${planHash}. Use both skills, edit only the selected sample, and use validate_sample while working. Do not revise the plan. When finished, re-read the source context, frozen plan, and final changed files. Return a Markdown self-audit that accounts for every plan item and states what validation was run.`));
    if (!selfAudit) throw new SyncError("Implementer did not produce a self-audit");
    let validation = await bounded(options.validate());
    if (validation.outputDigest !== options.outputDigest()) throw new SyncError("Validation returned a stale candidate digest");
    if (validation.passed) { assertFullValidation(validation, options.sample); return { plan, planHash, selfAudit, validation, repairPasses: 0 }; }
    if (!validation.repairable) throw new SyncError(`Validation infrastructure failure: ${validation.errors.join("\n")}`);
    selfAudit = await bounded(options.session.send(`The frozen plan ${planHash} remains unchanged. Repair only these deterministic validation failures, then self-audit again without revising the plan: ${JSON.stringify(validation.errors)}`));
    if (!selfAudit) throw new SyncError("Implementer did not produce a self-audit after repair");
    validation = await bounded(options.validate());
    if (validation.outputDigest !== options.outputDigest()) throw new SyncError("Validation returned a stale candidate digest");
    assertFullValidation(validation, options.sample);
    return { plan, planHash, selfAudit, validation, repairPasses: 1 };
  } finally { clearTimeout(timer); if (expired) await options.session.abort().catch(() => {}); }
}
