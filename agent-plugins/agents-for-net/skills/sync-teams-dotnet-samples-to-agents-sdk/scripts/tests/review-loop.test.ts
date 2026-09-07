import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { copilotArguments, runAgentLoop, type AgentLoopOptions } from "../src/agent-runner.js";
import { createContext, sourceEvidence } from "../src/context.js";
import { digestDirectory } from "../src/git.js";
import { createPlan } from "../src/plan.js";
import { parseReview } from "../src/review.js";
import type { AgentResult, ReviewResult, SyncContext } from "../src/types.js";
import { commit, fixture, git, write } from "./helpers.js";

function setup() {
  const item = fixture();
  const plan = createPlan(item.repo, item.upstream, "sample-a");
  const context = createContext(item.repo, item.upstream, plan, "sample-a");
  const value = JSON.parse(readFileSync(context.file, "utf8")) as SyncContext;
  const sampleRoot = path.join(item.repo, value.paths.destination);
  const implementation: AgentResult = {
    version: 1, sample: "sample-a", status: "unchanged", summary: "Equivalent fixture behavior",
    dispositions: value.changes.map((c) => ({ changeId: c.id, decision: "already-present",
      explanation: "Equivalent behavior exists", destinationPath: value.paths.destination + "/value.txt",
      symbol: "value", verification: "Fixture check" })),
    upstreamChanges: [], preservedDifferences: [], appliedPolicies: [],
    manifestReport: { mode: "complete", changes: [], validation: ["Reviewed commands"], externalSetup: [] },
  };
  const review: ReviewResult = { version: 1, sample: "sample-a", verdict: "approved", summary: "Verified",
    reviewedChangeIds: value.changes.map((c) => c.id), resolvedFindingIds: [], findings: [],
    manifestAssessment: "Commands checked", testAssessment: "Fixture behavior checked" };
  const options: AgentLoopOptions = {
    repo: item.repo, upstream: item.upstream, baseSha: git(item.repo, "rev-parse", "HEAD"), sample: "sample-a",
    sampleRoot: value.paths.destination, sourcePath: value.upstream.sourcePath,
    upstreamCommit: plan.upstreamCommit, sourceTree: plan.samples["sample-a"]!.sourceTree!,
    protectedPaths: [], outputDigestExcludes: [], policyKeys: [], context, maxAttempts: 5,
    runner: { run: async () => implementation }, reviewer: { run: async () => review },
    validate: async () => ({ version: 1, sample: "sample-a", passed: true, repairable: true,
      outputDigest: digestDirectory(sampleRoot),
      checks: { project: true, restore: true, build: true, manifest: true, httpSmoke: true, contracts: null },
      errors: [], externalValidationRequired: [] }),
  };
  return { item, options, implementation, review, sampleRoot };
}

const missingDue = { id: "missing-due", source: "Program.cs:CreateConfirmationCard",
  destination: "Agent.cs:CreateConfirmationCard", expectedBehavior: "Card contains the UTC Due value",
  correction: "Port the Due field; this is not formatting" };

test("exact evidence includes the added Due field and stable hunk IDs", () => {
  const item = fixture();
  const source = "samples/TeamsSDK/sample-a/dotnet/sample-a";
  write(path.join(item.upstream, source, "Program.cs"), 'new Fact("In:", delay);\n');
  const before = commit(item.upstream, "before");
  write(path.join(item.upstream, source, "Program.cs"), 'new Fact("In:", delay);\nnew Fact("Due:", dueUtc);\n');
  const after = commit(item.upstream, "after");
  const evidence = sourceEvidence(item.upstream, before, after, source);
  assert.equal(evidence.length, 1);
  assert.match(evidence[0]!.diff, /\+new Fact\("Due:"/);
  assert.deepEqual(evidence, sourceEvidence(item.upstream, before, after, source));
});

test("review rejection repairs missing behavior and preserves prior report", async () => {
  const { options, review, implementation, sampleRoot } = setup();
  let calls = 0;
  options.runner = { run: async ({ contextFile, attempt }) => {
    if (attempt === 2) {
      const value = JSON.parse(readFileSync(contextFile, "utf8")) as SyncContext;
      assert.equal(value.feedback?.implementation.summary, implementation.summary);
      assert.equal(value.feedback?.review?.findings[0]?.id, "missing-due");
      write(path.join(sampleRoot, "value.txt"), "Due: 2030-01-01 00:00 UTC");
    }
    return implementation;
  } };
  options.reviewer = { run: async () => {
    calls++;
    return calls === 1 ? { ...review, verdict: "changes-required", findings: [missingDue] } :
      { ...review, resolvedFindingIds: ["missing-due"] };
  } };
  const result = await runAgentLoop(options);
  assert.equal(result.attempts, 2);
  assert.equal(result.review?.result.verdict, "approved");
  assert.equal(result.review?.outputDigest, result.validation.outputDigest);
});

test("a reviewer cannot approve missing change accounting or skipped manifest", async () => {
  const { options, implementation } = setup();
  options.runner = { run: async () => ({ ...implementation, dispositions: [],
    manifestReport: { ...implementation.manifestReport, mode: "skipped", validation: [] } }) };
  const result = await runAgentLoop(options);
  assert.equal(result.validation.passed, false);
  assert.match(result.validation.errors.join("\n"), /each source change|manifest skill/);
});

test("repeated review findings stop early and never create state", async () => {
  const { options, review, item } = setup();
  options.reviewer = { run: async () => ({ ...review, verdict: "changes-required", findings: [missingDue] }) };
  const result = await runAgentLoop(options);
  assert.equal(result.attempts, 2);
  assert.equal(result.validation.passed, false);
  assert.equal(existsSync(path.join(item.repo, ".github/teams-sample-sync/state/sample-a.lock.json")), false);
});

test("five different candidates without approval exhaust the budget", async () => {
  const { options, review, implementation, sampleRoot } = setup();
  options.runner = { run: async ({ attempt }) => {
    write(path.join(sampleRoot, "value.txt"), String(attempt));
    return implementation;
  } };
  options.reviewer = { run: async () => ({ ...review, verdict: "changes-required", findings: [missingDue] }) };
  const result = await runAgentLoop(options);
  assert.equal(result.attempts, 5);
  assert.equal(result.validation.passed, false);
});

test("reviewer writes are rejected", async () => {
  const { options, review, sampleRoot } = setup();
  options.reviewer = { run: async () => {
    write(path.join(sampleRoot, "value.txt"), "tampered");
    return review;
  } };
  await assert.rejects(runAgentLoop(options), /Reviewer changed/);
});

test("blocked review stops after one cycle", async () => {
  const { options, review } = setup();
  options.reviewer = { run: async () => ({ ...review, verdict: "blocked", findings: [missingDue] }) };
  const result = await runAgentLoop(options);
  assert.equal(result.attempts, 1);
  assert.equal(result.validation.passed, false);
});

test("approval cannot override failed validation", async () => {
  const { options } = setup();
  const validate = options.validate;
  options.validate = async () => ({ ...await validate(), passed: false, errors: ["wrong card value"] });
  const result = await runAgentLoop(options);
  assert.equal(result.validation.passed, false);
});

test("valid already-present change permits reviewed state acknowledgement", async () => {
  const { options } = setup();
  const result = await runAgentLoop(options);
  assert.equal(result.validation.passed, true);
  assert.equal(result.review?.result.verdict, "approved");
});

test("review contract rejects unknown IDs and unresolved prior findings", () => {
  const { review } = setup();
  assert.throws(() => parseReview(review, "sample-a", ["unknown"]), /every source change/);
  assert.throws(() => parseReview(review, "sample-a", review.reviewedChangeIds, ["missing-due"]), /previous finding/);
  assert.throws(() => parseReview({ ...review, findings: [missingDue] }, "sample-a", review.reviewedChangeIds), /Only a review/);
});

test("review CLI exposes no write or shell tools", () => {
  const args = copilotArguments("review", { model: "auto" }, "review");
  assert.ok(args.includes("--available-tools=view,grep,glob,web_fetch"));
  assert.ok(args.includes("--deny-tool=write"));
  assert.ok(args.includes("--deny-tool=shell"));
  assert.ok(!args.includes("--allow-tool=write"));
});
