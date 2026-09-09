import assert from "node:assert/strict";
import test from "node:test";
import { permissionFor } from "../../src/agent-runner.js";
import { selectModel } from "../../src/model-selection.js";
import { evidenceDigest, parseAgentResult, parseReview } from "../../src/review.js";
import { runSyncSession, type PersistentSession } from "../../src/sync-session.js";
import { sanitizedChildEnvironment } from "../../src/validate.js";
import type { AgentResult, ValidationResult } from "../../src/types.js";

const agent: AgentResult = { version: 2, sample: "sample-a", status: "updated", summary: "Migrated", dispositions: [{ changeId: "change-1", decision: "adapted", explanation: "ported", destinationPath: "samples/dotnet/teams/sample-a/Program.cs", symbol: "Run", verification: "validation" }], upstreamChanges: [], preservedDifferences: [], appliedPolicies: [], manifestReport: { mode: "complete", changes: [], validation: ["schema"], externalSetup: [], capabilities: [{ id: "bot", kind: "bot", evidence: ["Program.cs"], decision: "manifest-field-required", manifestPath: "bots[0]", reference: "manifest skill" }] } };
const validation = (): ValidationResult => ({ version: 2, id: "validation-1", sample: "sample-a", passed: true, repairable: true, outputDigest: "digest-a", group: "all", checks: Object.fromEntries(["project", "restore", "build", "manifest", "httpSmoke"].map((key) => [key, { status: "passed", errors: [] }])), errors: [], externalValidationRequired: [] });
class FakeSession implements PersistentSession { constructor(private readonly responses: unknown[]) {} async send(): Promise<unknown> { return this.responses.shift(); } async close(): Promise<void> {} }

test("one persistent implementation session is validated then independently reviewed", async () => {
  let implementations = 0; let reviews = 0;
  const result = await runSyncSession({ sample: "sample-a", contextFile: "context.json", sourceChangeIds: ["change-1"], policyKeys: [], createImplementation: async () => { implementations++; return new FakeSession([null, null, null, agent]); }, createReviewer: async () => { reviews++; return new FakeSession([{ version: 2, sample: "sample-a", verdict: "approved", summary: "verified", reviewedChangeIds: ["change-1"], reviewedCapabilityIds: ["bot"], findings: [], resolvedFindingIds: [], testAssessment: "tests", coverageLimitations: ["credentialed UI"] }]); }, validate: async () => validation(), outputDigest: () => "digest-a", coverage: () => [] });
  assert.equal(implementations, 1); assert.equal(reviews, 1); assert.equal(result.stage, "complete"); assert.equal(result.review?.validationId, "validation-1");
});

test("review findings repair using the same reviewer with current evidence", async () => {
  const fixed = { ...agent, summary: "Migrated and fixed" }; let reviews = 0;
  const finding = { id: "finding", category: "code", source: "source", destination: "Program.cs", expectedBehavior: "behavior", correction: "fix it" };
  const messages: string[] = [];
  const responses = [approval({ verdict: "changes-required", findings: [finding] }), approval({ resolvedFindingIds: ["finding"] })];
  const result = await runSyncSession({ ...options([null, null, null, agent, { ...fixed, version: 9 }, fixed]), createReviewer: async () => { reviews++; return { send: async (message) => { messages.push(message); return responses.shift(); }, close: async () => {} }; } });
  assert.equal(reviews, 1); assert.equal(result.metrics.repairPasses, 1); assert.equal(result.evidenceDigest, evidenceDigest(fixed));
  assert.equal(result.metrics.rejectedImplementerReports, 1);
  assert.match(messages[1]!, /Migrated and fixed/); assert.match(messages[1]!, /currentValidation/); assert.match(messages[0]!, /context.json/);
});

test("review and implementation parsers reject incomplete coverage and stale semantics", () => {
  assert.deepEqual(parseAgentResult({ ...agent, dispositions: [] }, "sample-a").dispositions, []);
  assert.throws(() => parseReview({ version: 2, sample: "sample-a", verdict: "approved", summary: "bad", reviewedChangeIds: ["change-1"], reviewedCapabilityIds: [], findings: [], resolvedFindingIds: [], testAssessment: "none", coverageLimitations: ["none"] }, "sample-a", ["change-1"], ["bot"]), /every source change and capability/);
});

test("capability model selection is deterministic and does not infer missing metadata", () => {
  const choice = selectModel({ strategy: "capability", minimumContextTokens: 100, maximumCostMultiplier: 2, fallback: "fail" }, [{ id: "z", policy: { state: "enabled" }, capabilities: { limits: { max_prompt_tokens: 100 } }, billing: { multiplier: 1 } }, { id: "a", policy: { state: "enabled" }, capabilities: { limits: { max_prompt_tokens: 100 } }, billing: { multiplier: 1 } }]);
  assert.equal(choice.model, "a"); assert.throws(() => selectModel({ strategy: "capability", minimumContextTokens: 100, fallback: "fail" }, [{ id: "unknown" }]), /No model/);
});

test("permission callback confines writes and denies a reviewer", () => {
  assert.deepEqual(permissionFor(process.cwd(), "automation", true, { kind: "write", fileName: "automation/a.ts", diff: "", intention: "test", canOfferSessionApproval: false }), { kind: "reject" });
  assert.deepEqual(permissionFor(process.cwd(), "automation", false, { kind: "custom-tool", toolName: "shell", toolDescription: "" }), { kind: "reject" });
});

test("invalid evidence is corrected in the existing implementation session without a restart", async () => {
  let sessions = 0; let implementationSends = 0;
  const result = await runSyncSession({ sample: "sample-a", contextFile: "context.json", sourceChangeIds: ["change-1"], policyKeys: [], createImplementation: async () => { sessions++; return new FakeSession([null, null, null, { ...agent, dispositions: [] }, agent]); }, createReviewer: async () => new FakeSession([{ version: 2, sample: "sample-a", verdict: "approved", summary: "verified", reviewedChangeIds: ["change-1"], reviewedCapabilityIds: ["bot"], findings: [], resolvedFindingIds: [], testAssessment: "tests", coverageLimitations: ["UI"] }]), validate: async (group) => { implementationSends++; assert.equal(group, "all"); return validation(); }, outputDigest: () => "digest-a", coverage: (value) => value.dispositions.length ? [] : ["missing disposition"] });
  assert.equal(sessions, 1); assert.equal(result.metrics.rejectedImplementerReports, 1); assert.equal(implementationSends, 1);
});

test("candidate mutations after review start invalidate approval", async () => {
  let calls = 0;
  await assert.rejects(runSyncSession({ sample: "sample-a", contextFile: "context.json", sourceChangeIds: ["change-1"], policyKeys: [], createImplementation: async () => new FakeSession([null, null, null, agent]), createReviewer: async () => new FakeSession([{ version: 2, sample: "sample-a", verdict: "approved", summary: "verified", reviewedChangeIds: ["change-1"], reviewedCapabilityIds: ["bot"], findings: [], resolvedFindingIds: [], testAssessment: "tests", coverageLimitations: ["UI"] }]), validate: async () => validation(), outputDigest: () => ++calls === 1 ? "digest-a" : "digest-b", coverage: () => [] }), /Candidate or evidence changed during review/);
});

test("candidate execution receives a narrow environment without Copilot or GitHub tokens", () => {
  const environment = sanitizedChildEnvironment({ TEST_VALUE: "ok" });
  assert.equal(environment.TEST_VALUE, "ok"); assert.equal(environment.GITHUB_TOKEN, undefined); assert.equal(environment.COPILOT_TOKEN, undefined);
});

function approval(extra: Record<string, unknown> = {}) { return { version: 2, sample: "sample-a", verdict: "approved", summary: "verified", reviewedChangeIds: ["change-1"], reviewedCapabilityIds: ["bot"], findings: [], resolvedFindingIds: [], testAssessment: "tests", coverageLimitations: ["UI"], ...extra }; }
function options(responses: unknown[]) { return { sample: "sample-a", contextFile: "context.json", sourceChangeIds: ["change-1"], policyKeys: [], createImplementation: async () => new FakeSession(responses), createReviewer: async () => new FakeSession([approval()]), validate: async () => validation(), outputDigest: () => "digest-a", coverage: () => [] }; }

test("same implementation repairs actual validation failures before any review", async () => {
  let validations = 0; let reviewStarted = false;
  const result = await runSyncSession({ ...options([null, null, null, agent, agent]), validate: async () => { assert.equal(reviewStarted, false); return ++validations === 1 ? { ...validation(), passed: false, errors: ["compile failure"] } : validation(); }, createReviewer: async () => { reviewStarted = true; return new FakeSession([approval()]); } });
  assert.equal(validations, 2); assert.equal(result.metrics.rejectedImplementerReports, 0);
});

test("unchanged failing validation terminates without semantic restarts", async () => {
  let calls = 0;
  await assert.rejects(runSyncSession({ ...options([null, null, null, agent, agent]), validate: async () => { calls++; return { ...validation(), passed: false, errors: ["compile failure"] }; } }), /without candidate or diagnostic progress/);
  assert.equal(calls, 2);
});

test("structured implementer blocker does not require a build or reviewer", async () => {
  const blocked = { ...agent, status: "unsupported" };
  const result = await runSyncSession({ ...options([blocked]), validate: async () => { throw new Error("must not validate"); }, createReviewer: async () => { throw new Error("must not review"); } });
  assert.equal(result.stage, "blocked"); assert.equal(result.validation, undefined);
});

test("idle session gets one continuation then stops", async () => {
  let sends = 0;
  await assert.rejects(runSyncSession({ ...options([]), createImplementation: async () => ({ send: async () => { sends++; return undefined; }, close: async () => {} }) }), /remained idle/);
  assert.equal(sends, 5);
});

test("deadline aborts a stalled turn and closes sessions", async () => {
  let aborted = false; let closed = false; let validationCancelled = false;
  await assert.rejects(runSyncSession({ ...options([]), deadlineMs: 10, cancelValidation: () => { validationCancelled = true; }, createImplementation: async () => ({ send: () => new Promise(() => {}), abort: async () => { aborted = true; }, close: async () => { closed = true; } }) }), /deadline exceeded/);
  assert.equal(aborted, true); assert.equal(closed, true); assert.equal(validationCancelled, true);
});
