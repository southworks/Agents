import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { CopilotOutputError, copilotArguments, parseAgentResult, parseCopilotOutput, runAgentLoop, type AgentLoopOptions } from "../../src/agent-runner.js";
import { createContext, sourceEvidence } from "../../src/context.js";
import { digestDirectory } from "../../src/git.js";
import { createPlan } from "../../src/plan.js";
import { manifestReviewErrors, parseReview } from "../../src/review.js";
import type { AgentResult, ReviewResult, SyncContext } from "../../src/types.js";
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
    manifestReport: { mode: "complete", changes: [], validation: ["Reviewed commands"], externalSetup: [],
      capabilities: [{ id: "base-bot", kind: "bot", evidence: ["SampleAgent.cs"], decision: "manifest-field-required",
        manifestPath: "bots[0]", reference: "references/bots.md" }] },
  };
  const review: ReviewResult = { version: 1, sample: "sample-a", verdict: "approved", summary: "Verified",
    reviewedChangeIds: value.changes.map((c) => c.id), resolvedFindingIds: [], findings: [],
    manifestAssessment: "Commands checked", testAssessment: "Fixture behavior checked",
    manifestCapabilities: implementation.manifestReport.capabilities };
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

test("Copilot output parser ignores source-code fences before the final JSON report", () => {
  const output = [
    "I checked this handler:",
    "```csharp",
    "static string Value() => \"not JSON\";",
    "```",
    "```json",
    JSON.stringify({ version: 1, verdict: "approved" }),
    "```",
  ].join("\n");

  assert.deepEqual(parseCopilotOutput(output), { version: 1, verdict: "approved" });
});

test("complete manifest reports require an evidence-backed capability ledger", () => {
  const { implementation } = setup();
  assert.throws(() => parseAgentResult({ ...implementation,
    manifestReport: { ...implementation.manifestReport, capabilities: [] } }, "sample-a"), /capability ledger/);
});

test("implemented behavior with no manifest field has an unambiguous ledger decision", () => {
  const { implementation } = setup();
  const result = parseAgentResult({ ...implementation, manifestReport: {
    ...implementation.manifestReport,
    capabilities: [{ id: "suggested-actions", kind: "activity-payload", evidence: ["Agent.cs:BuildSuggestions"],
      decision: "no-manifest-field", manifestPath: "none", reference: "references/cards-and-dialogs.md" }],
  } }, "sample-a");
  assert.equal(result.manifestReport.capabilities[0]?.decision, "no-manifest-field");
});

test("invalid implementer capability report gets a report-only retry", async () => {
  const { options, implementation } = setup();
  let implementations = 0; let validations = 0;
  const validate = options.validate;
  options.runner = { run: async ({ prompt }) => {
    implementations++;
    if (implementations === 1) return { ...implementation, manifestReport: {
      ...implementation.manifestReport,
      capabilities: [{ ...implementation.manifestReport.capabilities[0]!, manifestPath: "none" }],
    } };
    assert.match(prompt, /Correct your previous implementation report without changing the candidate/);
    return implementation;
  } };
  options.validate = async () => { validations++; return validate(); };

  const result = await runAgentLoop(options);
  assert.equal(result.attempts, 1);
  assert.equal(implementations, 2);
  assert.equal(validations, 1);
  assert.equal(result.validation.passed, true);
});

test("invalid implementation reports exhaust only their bounded report budget", async () => {
  const { options, implementation } = setup();
  let implementations = 0;
  options.runner = { run: async () => {
    implementations++;
    return { ...implementation, manifestReport: { ...implementation.manifestReport, capabilities: [] } };
  } };

  await assert.rejects(runAgentLoop(options), /Invalid implementation report.*repair budget exhausted/s);
  assert.equal(implementations, 3);
});

test("implementation report repair cannot change the candidate", async () => {
  const { options, implementation, sampleRoot } = setup();
  let implementations = 0;
  options.runner = { run: async () => {
    implementations++;
    if (implementations === 1) return { ...implementation,
      manifestReport: { ...implementation.manifestReport, capabilities: [] } };
    write(path.join(sampleRoot, "value.txt"), "changed during report repair");
    return implementation;
  } };

  await assert.rejects(runAgentLoop(options), /Implementation report repair changed the candidate/);
  assert.equal(implementations, 2);
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

test("invalid disposition coverage is repaired before another review", async () => {
  const { options, review, implementation } = setup();
  let implementations = 0; let reviews = 0;
  options.runner = { run: async ({ contextFile }) => {
    implementations++;
    if (implementations === 2) {
      return { ...implementation, dispositions: [...implementation.dispositions!, {
        ...implementation.dispositions![0]!, changeId: "synthetic-repair-id",
      }] };
    }
    if (implementations === 3) {
      const value = JSON.parse(readFileSync(contextFile, "utf8")) as SyncContext;
      assert.match(value.validationErrors?.join("\n") ?? "", /each source change ID exactly once/);
    }
    return implementation;
  } };
  options.reviewer = { run: async ({ prompt }) => {
    reviews++;
    if (reviews === 1) return { ...review, verdict: "changes-required", findings: [missingDue] };
    assert.match(prompt, /Open finding IDs[^\n]*\["missing-due"\]/);
    return { ...review, resolvedFindingIds: ["missing-due"] };
  } };

  const result = await runAgentLoop(options);
  assert.equal(result.attempts, 3);
  assert.equal(implementations, 3);
  assert.equal(reviews, 2);
  assert.equal(result.validation.passed, true);
});

test("a reviewer cannot approve missing change accounting or skipped manifest", async () => {
  const { options, implementation } = setup();
  options.runner = { run: async () => ({ ...implementation, dispositions: [],
    manifestReport: { ...implementation.manifestReport, mode: "skipped", validation: [] } }) };
  const result = await runAgentLoop(options);
  assert.equal(result.validation.passed, false);
  assert.match(result.validation.errors.join("\n"), /each source change|manifest skill/);
});

test("required manifest capabilities must point to existing manifest fields", async () => {
  const { options, implementation } = setup();
  options.maxAttempts = 1;
  options.runner = { run: async () => ({ ...implementation, manifestReport: {
    ...implementation.manifestReport,
    capabilities: [{ id: "named-command", kind: "bot-command", evidence: ["README.md: command"],
      decision: "manifest-field-required", manifestPath: "bots[0].commandLists",
      reference: "references/bots.md" }],
  } }) };

  const result = await runAgentLoop(options);
  assert.equal(result.failureStage, "evidence");
  assert.match(result.validation.errors.join("\n"), /Manifest capability path does not exist.*commandLists/);
});

test("a completed migration cannot omit the selected sample manifest", async () => {
  const { options, implementation, sampleRoot } = setup();
  options.maxAttempts = 1;
  rmSync(path.join(sampleRoot, "appManifest", "manifest.json"));
  options.runner = { run: async () => implementation };

  const result = await runAgentLoop(options);
  assert.equal(result.failureStage, "evidence");
  assert.match(result.validation.errors.join("\n"), /must contain appManifest\/manifest\.json/);
});

test("independent reviewer must agree with the final manifest capability inventory", () => {
  const { implementation, review } = setup();
  const changedAssessment: ReviewResult = { ...review, manifestCapabilities: [{
    ...review.manifestCapabilities[0]!, decision: "no-manifest-field", manifestPath: "none",
  }] };
  assert.match(manifestReviewErrors(implementation, changedAssessment).join("\n"), /assessment differs.*base-bot/);
});

test("repeated review findings stop early and never create state", async () => {
  const { options, review, item } = setup();
  options.reviewer = { run: async () => ({ ...review, verdict: "changes-required", findings: [missingDue] }) };
  const result = await runAgentLoop(options);
  assert.equal(result.attempts, 2);
  assert.equal(result.validation.passed, false);
  assert.equal(existsSync(path.join(item.repo, "automation/teams-sample-sync/state/sample-a.lock.json")), false);
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

test("contradictory approval retries only the reviewer and preserves validation", async () => {
  const { options, review, implementation } = setup();
  let implementations = 0; let validations = 0; let reviews = 0;
  const validate = options.validate;
  options.runner = { run: async () => { implementations++; return implementation; } };
  options.validate = async () => { validations++; return validate(); };
  options.reviewer = { run: async ({ prompt }) => {
    reviews++;
    if (reviews === 1) return { ...review, findings: [{ ...missingDue,
      correction: "Optional cleanup; not blocking" }] };
    assert.match(prompt, /Only a review without blocking findings can approve/);
    return review;
  } };
  const result = await runAgentLoop(options);
  assert.equal(result.attempts, 1);
  assert.equal(implementations, 1);
  assert.equal(validations, 1);
  assert.equal(reviews, 2);
  assert.equal(result.validation.passed, true);
});

test("malformed reviewer output gets a bounded report-only retry", async () => {
  const { options, review } = setup();
  let reviews = 0;
  options.reviewer = { run: async () => {
    reviews++;
    if (reviews === 1) throw new CopilotOutputError("Copilot fenced output is not valid JSON");
    return review;
  } };

  const result = await runAgentLoop(options);
  assert.equal(result.attempts, 1);
  assert.equal(reviews, 2);
  assert.equal(result.validation.passed, true);
});

test("invalid reviews exhaust the report repair budget without consuming migration cycles", async () => {
  const { options, review, item } = setup();
  let reviews = 0;
  options.reviewer = { run: async () => { reviews++; return { ...review, findings: [missingDue] }; } };
  const result = await runAgentLoop(options);
  assert.equal(reviews, 3);
  assert.equal(result.attempts, 1);
  assert.equal(result.validation.passed, false);
  assert.equal(result.failureStage, "review");
  assert.equal(result.validation.checks.build, true);
  assert.match(result.validation.errors.join("\n"), /Invalid review report|Review report repair budget exhausted/);
  assert.equal(result.review, undefined);
  assert.equal(existsSync(path.join(item.repo, "automation/teams-sample-sync/state/sample-a.lock.json")), false);
});

test("invalid review output cannot hide reviewer writes", async () => {
  const { options, review, sampleRoot } = setup();
  let reviews = 0;
  options.reviewer = { run: async () => {
    reviews++;
    write(path.join(sampleRoot, "value.txt"), "tampered");
    return { ...review, findings: [missingDue] };
  } };
  await assert.rejects(runAgentLoop(options), /Reviewer changed/);
  assert.equal(reviews, 1);
});
