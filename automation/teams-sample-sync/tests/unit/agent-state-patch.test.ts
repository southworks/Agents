import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { main } from "../../src/cli.js";
import { targets } from "../../src/config.js";
import { createContext } from "../../src/context.js";
import { changedPaths, digestDirectory, hash, stable } from "../../src/git.js";
import { createPlan } from "../../src/plan.js";
import { evidenceDigest } from "../../src/review.js";
import { createState, statePath, validateState } from "../../src/state.js";
import type { AgentResult, SyncContext, SyncResult, ValidationResult } from "../../src/types.js";
import { fixture, git, gitBuffer, write } from "./helpers.js";
function validation(passed: boolean, outputDigest: string): ValidationResult {
  return { version: 2, id: "validation-1", sample: "sample-a", passed, repairable: true, outputDigest, group: "all", checks: Object.fromEntries(["project", "restore", "build", "manifest", "httpSmoke", "contracts", "sampleTests"].map((name) => [name, { status: passed ? "passed" : "failed", errors: [] }])), errors: passed ? [] : ["failure"], externalValidationRequired: [] };
}
test("version-2 checkpoints require successful validation", () => {
  const item = fixture(); const entry = createPlan(item.repo, item.upstream).samples["sample-a"]!;
  assert.throws(() => createState("sample-a", entry, validation(false, "bad")), /successful validation/);
  const state = createState("sample-a", entry, validation(true, "output"));
  validateState(state, "sample-a"); assert.equal(state.version, 2);
});
test("publisher verifies v3 bindings and rejects stale, incomplete, and tampered artifacts", async () => {
  const item = fixture(); const plan = createPlan(item.repo, item.upstream); const entry = plan.samples["sample-a"]!;
  const contextFiles = createContext(item.repo, item.upstream, plan, "sample-a");
  const context = JSON.parse(readFileSync(contextFiles.file, "utf8")) as SyncContext;
  const baseSha = git(item.repo, "rev-parse", "HEAD"); const sampleRelative = "samples/dotnet/teams/sample-a";
  const sampleRoot = path.join(item.repo, sampleRelative); write(path.join(sampleRoot, "value.txt"), "validated output\n");
  const outputDigest = digestDirectory(sampleRoot, ["bin/**", "obj/**"]); const checked = validation(true, outputDigest);
  const agent: AgentResult = { version: 2, sample: "sample-a", status: "updated", summary: "Migrated fixture", dispositions: context.changes.map((change) => ({ changeId: change.id, decision: "adapted", explanation: "Mapped behavior", destinationPath: `${sampleRelative}/value.txt`, symbol: "value", verification: "Fixture comparison" })), upstreamChanges: [], preservedDifferences: [], appliedPolicies: [], manifestReport: { mode: "complete", changes: [], validation: ["Manifest inspected"], externalSetup: [], capabilities: [{ id: "base-bot", kind: "bot", evidence: ["value.txt"], decision: "manifest-field-required", manifestPath: "bots[0]", reference: "references/bots.md" }] } };
  const state = createState("sample-a", entry, checked); write(statePath(item.repo, "sample-a"), JSON.stringify(state));
  git(item.repo, "add", "-N", "--", sampleRelative, "automation/teams-sample-sync/state/sample-a.lock.json");
  const resultDirectory = path.join(item.repo, ".sync/result");
  write(path.join(resultDirectory, "change.patch"), gitBuffer(item.repo, "diff", "--binary", baseSha, "--", sampleRelative, "automation/teams-sample-sync/state/sample-a.lock.json"));
  write(path.join(resultDirectory, "source-context.json"), JSON.stringify(context));
  const result: SyncResult = { version: 3, sample: "sample-a", status: "updated", publishable: true, baseSha, previousUpstreamCommit: null, upstreamCommit: entry.upstreamCommit!, upstreamChanges: context.upstream.changes, changedComponents: entry.changedComponents, destinationChanges: changedPaths(item.repo, baseSha), copilot: targets(item.repo).copilot, observedModels: [], migrationPolicies: [], sourceTree: entry.sourceTree!, sourceContextDigest: hash(stable(context)), inputDigest: entry.inputDigest!, componentDigests: entry.componentDigests!, outputDigest, evidenceDigest: evidenceDigest(agent), state, agent, validation: checked, review: { outputDigest, evidenceDigest: evidenceDigest(agent), validationId: checked.id, result: { version: 2, sample: "sample-a", verdict: "approved", summary: "Reviewed", reviewedChangeIds: context.changes.map((change) => change.id), reviewedCapabilityIds: ["base-bot"], findings: [], resolvedFindingIds: [], testAssessment: "Fixture checked", coverageLimitations: [] } }, metrics: { repairPasses: 0, rejectedImplementerReports: 0, rejectedReviewerReports: 0 }, diagnostics: [] };
  const resultFile = path.join(resultDirectory, "sync-result.json");
  const verify = async (value: unknown): Promise<number> => { write(resultFile, JSON.stringify(value)); return main(["verify-patch", "--repo-root", item.repo, "--sample", "sample-a", "--result", resultFile]); };
  assert.equal(await verify(result), 0, "current validated v3 patch must publish");
  const mutations: Array<(value: SyncResult) => void> = [
    (value) => { delete value.review; },
    (value) => { value.review!.outputDigest = "stale"; },
    (value) => { value.review!.evidenceDigest = "stale"; },
    (value) => { value.review!.validationId = "stale"; },
    (value) => { value.sourceContextDigest = "stale"; },
    (value) => { value.agent!.summary = "unreviewed evidence"; },
    (value) => { value.review!.result.reviewedCapabilityIds = []; },
    (value) => { value.review!.result.reviewedChangeIds = []; },
    (value) => { value.validation!.checks.build = { status: "not-run", errors: [] }; },
    (value) => { value.validation!.group = "code"; },
    (value) => { value.copilot.implementation = { strategy: "capability", fallback: "fail" }; },
    (value) => { value.state!.outputDigest = "tampered"; },
  ];
  for (const mutate of mutations) { const altered = structuredClone(result); mutate(altered); assert.equal(await verify(altered), 2); }
  assert.equal(await verify({ ...result, version: 2 }), 2, "old transient artifacts must fail clearly");
  write(path.join(sampleRoot, "value.txt"), "tampered after validation\n"); assert.equal(await verify(result), 2);
  write(path.join(sampleRoot, "value.txt"), "validated output\n");
  for (const relative of ["outside.txt", `${sampleRelative}/manifest-evidence.md`]) {
    write(path.join(item.repo, relative), "unauthorized\n"); assert.equal(await verify(result), 2); rmSync(path.join(item.repo, relative));
  }
  assert.equal(await verify(result), 0, "restored exact candidate remains publishable");
});
