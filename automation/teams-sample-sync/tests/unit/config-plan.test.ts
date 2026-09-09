import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { targets } from "../../src/config.js";
import { createPlan } from "../../src/plan.js";
import { policies } from "../../src/policy.js";
import { statePath } from "../../src/state.js";
import { fixture, write } from "./helpers.js";

test("policy is validated, selected, and sorted", () => {
  const item = fixture();
  write(path.join(item.repo, "automation/teams-sample-sync/config/migration-policy.yml"), `version: 1
policies:
  - key: sample-a.z
    sample: sample-a
    instruction: second
    rationale: reason
    source: PR-2
  - key: sample-a.a
    sample: sample-a
    instruction: first
    rationale: reason
    source: PR-1
`);
  assert.deepEqual(policies(item.repo, targets(item.repo)).map((policy) => policy.key), ["sample-a.a", "sample-a.z"]);
  write(path.join(item.repo, "automation/teams-sample-sync/config/migration-policy.yml"), `version: 1
policies:
  - key: Bad Key
    sample: sample-a
    instruction: x
    rationale: x
    source: x
`);
  assert.throws(() => policies(item.repo, targets(item.repo)), /lowercase and stable/);
});

test("policy rejects duplicate keys, unknown samples, and empty fields", () => {
  const item = fixture();
  const file = path.join(item.repo, "automation/teams-sample-sync/config/migration-policy.yml");
  write(file, `version: 1
policies:
  - { key: sample-a.same, sample: sample-a, instruction: x, rationale: x, source: x }
  - { key: sample-a.same, sample: sample-a, instruction: y, rationale: y, source: y }
`);
  assert.throws(() => policies(item.repo, targets(item.repo)), /Duplicate policy key/);
  write(file, "version: 1\npolicies:\n  - { key: missing.x, sample: missing, instruction: x, rationale: x, source: x }\n");
  assert.throws(() => policies(item.repo, targets(item.repo)), /unknown sample/);
  write(file, "version: 1\npolicies:\n  - { key: sample-a.x, sample: sample-a, instruction: '', rationale: x, source: x }\n");
  assert.throws(() => policies(item.repo, targets(item.repo)), /instruction is required/);
});

test("plan pins the commit, detects candidates, and version-2 state makes inputs unchanged", () => {
  const item = fixture();
  const first = createPlan(item.repo, item.upstream);
  const entry = first.samples["sample-a"]!;
  assert.equal(entry.status, "pending");
  assert.deepEqual(first.matrix, [{ sample: "sample-a", upstreamCommit: item.firstUpstreamCommit }]);
  assert.deepEqual(first.newSampleCandidates, [{ sample: "new-candidate", status: "new-sample-candidate" }]);
  write(statePath(item.repo, "sample-a"), `${JSON.stringify({
    version: 2, sample: "sample-a", upstreamCommit: entry.upstreamCommit, sourceTree: entry.sourceTree,
    inputDigest: entry.inputDigest, outputDigest: "output", componentDigests: entry.componentDigests, status: "verified",
  }, null, 2)}\n`);
  const second = createPlan(item.repo, item.upstream);
  assert.equal(second.samples["sample-a"]!.status, "unchanged");
  assert.deepEqual(second.matrix, []);
  const policyFile = path.join(item.repo, "automation/teams-sample-sync/config/migration-policy.yml");
  assert.match(readFileSync(policyFile, "utf8"), /policies/);
  write(policyFile, `version: 1
policies:
  - key: sample-a.behavior
    sample: sample-a
    instruction: Preserve behavior.
    rationale: Reviewed intent.
    source: PR-1
`);
  const third = createPlan(item.repo, item.upstream);
  assert.equal(third.samples["sample-a"]!.status, "pending");
  assert.deepEqual(third.samples["sample-a"]!.changedComponents, ["policies"]);
});

test("legacy state is stale and unsafe target paths fail", () => {
  const item = fixture();
  write(statePath(item.repo, "sample-a"), "{\"version\":1}\n");
  assert.equal(createPlan(item.repo, item.upstream).samples["sample-a"]!.status, "pending");
  const targetsFile = path.join(item.repo, "automation/teams-sample-sync/config/targets.yml");
  write(targetsFile, readFileSync(targetsFile, "utf8").replace("destination: sample-a", "destination: ../../escape"));
  assert.throws(() => targets(item.repo), /unsafe path/);
});

test("state v2 created before Copilot configuration becomes pending without losing three-way history", () => {
  const item = fixture();
  const first = createPlan(item.repo, item.upstream);
  const entry = first.samples["sample-a"]!;
  const previousComponentDigests = { ...entry.componentDigests };
  delete previousComponentDigests.copilot;
  write(statePath(item.repo, "sample-a"), `${JSON.stringify({
    version: 2, sample: "sample-a", upstreamCommit: entry.upstreamCommit, sourceTree: entry.sourceTree,
    inputDigest: "input-before-copilot-configuration", outputDigest: "output",
    componentDigests: previousComponentDigests, status: "verified",
  }, null, 2)}\n`);

  const next = createPlan(item.repo, item.upstream).samples["sample-a"]!;
  assert.equal(next.status, "pending");
  assert.deepEqual(next.changedComponents, ["copilot"]);
  assert.equal((next.previousState as { upstreamCommit: string }).upstreamCommit, entry.upstreamCommit);
});

test("role model policies are validated and tracked as synchronization inputs", () => {
  const item = fixture();
  const file = path.join(item.repo, "automation/teams-sample-sync/config/targets.yml");
  const original = readFileSync(file, "utf8");
  const entry = createPlan(item.repo, item.upstream).samples["sample-a"]!;
  write(statePath(item.repo, "sample-a"), JSON.stringify({ version: 2, sample: "sample-a", upstreamCommit: entry.upstreamCommit, sourceTree: entry.sourceTree, inputDigest: entry.inputDigest, outputDigest: "output", componentDigests: entry.componentDigests, status: "verified" }));
  assert.equal(targets(item.repo).copilot.implementation.strategy, "auto");
  write(file, original.replace("default: { strategy: auto }", "implementation: { strategy: explicit, model: gpt-5.6-terra, reasoningEffort: high }\n  review: { strategy: explicit, model: gpt-5.6-terra, reasoningEffort: medium }"));
  assert.deepEqual(targets(item.repo).copilot.implementation, { strategy: "explicit", model: "gpt-5.6-terra", reasoningEffort: "high" });
  assert.deepEqual(targets(item.repo).copilot.review, { strategy: "explicit", model: "gpt-5.6-terra", reasoningEffort: "medium" });
  write(file, original);
  write(file, original.replace("default: { strategy: auto }", "default: { strategy: capability, requireReasoning: true, fallback: fail }"));
  assert.equal(targets(item.repo).copilot.implementation.preferredReasoningEffort, "high");
  assert.deepEqual(createPlan(item.repo, item.upstream).samples["sample-a"]!.changedComponents, ["copilot"]);
  for (const invalid of ["strategy: auto, preferredReasoningEffort: high", "strategy: explicit, model: auto, reasoningEffort: high", "strategy: explicit, model: gpt-5.6-terra", "strategy: capability", "strategy: capability, fallback: fail, maximumCostMultiplier: .inf", "strategy: capability, fallback: fail, preferredReasoningEffort: extreme", "strategy: capability, fallback: fail, preferredReasoningEffort: max"]) {
    write(file, original.replace("default: { strategy: auto }", `default: { ${invalid} }`));
    assert.throws(() => targets(item.repo));
  }
});
test("trusted skill, prompt and tool changes invalidate checkpoints", () => {
  const item = fixture();
  const entry = createPlan(item.repo, item.upstream).samples["sample-a"]!;
  write(statePath(item.repo, "sample-a"), JSON.stringify({ version: 2, sample: "sample-a", upstreamCommit: entry.upstreamCommit, sourceTree: entry.sourceTree, inputDigest: entry.inputDigest, outputDigest: "output", componentDigests: entry.componentDigests, status: "verified" }));
  for (const [relative, component] of [
    ["skills/sync-teams-dotnet-samples-to-agents-sdk/SKILL.md", "syncSkill"],
    ["prompts/agent-prompt.md", "validator"],
    ["prompts/review-prompt.md", "validator"],
    ["src/agent-tools.ts", "validator"],
    ["src/sync-session.ts", "validator"],
    ["package.json", "validator"],
    ["package-lock.json", "validator"],
  ]) {
    const file = path.join(item.repo, "automation/teams-sample-sync", relative!);
    const original = readFileSync(file, "utf8");
    write(file, `${original}\nchanged requirement\n`);
    assert.ok(createPlan(item.repo, item.upstream).samples["sample-a"]!.changedComponents.includes(component!));
    write(file, original);
  }
});
