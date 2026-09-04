import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SyncError } from "./config.js";
import type { PlanSample, State, ValidationResult } from "./types.js";
export const statePath = (repo: string, sample: string): string => path.join(repo, ".github/teams-sample-sync/state", `${sample}.lock.json`);

export function readState(repo: string, sample: string): State | undefined {
  const file = statePath(repo, sample);
  if (!existsSync(file)) return undefined;
  let value: unknown;
  try { value = JSON.parse(readFileSync(file, "utf8")); }
  catch { throw new SyncError(`Invalid state JSON: ${file}`); }
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 2) return undefined;
  validateState(value as State, sample);
  return value as State;
}

export function readPriorState(repo: string, sample: string): Pick<State, "upstreamCommit" | "sourceTree"> | undefined {
  const file = statePath(repo, sample);
  if (!existsSync(file)) return undefined;
  let value: unknown;
  try { value = JSON.parse(readFileSync(file, "utf8")); }
  catch { throw new SyncError(`Invalid state JSON: ${file}`); }
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if ((candidate.version !== 1 && candidate.version !== 2) ||
      typeof candidate.upstreamCommit !== "string" || typeof candidate.sourceTree !== "string") return undefined;
  return { upstreamCommit: candidate.upstreamCommit, sourceTree: candidate.sourceTree };
}

export function validateState(value: State, sample: string): void {
  if (value.version !== 2 || value.sample !== sample || value.status !== "verified" ||
      typeof value.upstreamCommit !== "string" || typeof value.sourceTree !== "string" ||
      typeof value.inputDigest !== "string" || typeof value.outputDigest !== "string" ||
      !value.componentDigests || typeof value.componentDigests !== "object") {
    throw new SyncError("Invalid version-2 state");
  }
  const required = ["sourceTree", "target", "policies", "protection", "migrationSkill", "manifestSkill", "canonicalSample", "packagePolicy", "validator"];
  if (required.some((key) => typeof value.componentDigests[key] !== "string")) {
    throw new SyncError("Version-2 state has incomplete component digests");
  }
}

export function createState(sample: string, plan: PlanSample, validation: ValidationResult): State {
  if (!validation.passed || !plan.upstreamCommit || !plan.sourceTree || !plan.inputDigest || !plan.componentDigests) {
    throw new SyncError("Cannot create state before successful validation");
  }
  return {
    version: 2,
    sample,
    upstreamCommit: plan.upstreamCommit,
    sourceTree: plan.sourceTree,
    inputDigest: plan.inputDigest,
    outputDigest: validation.outputDigest,
    componentDigests: plan.componentDigests,
    status: "verified",
  };
}
