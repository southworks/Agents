import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { targets } from "../src/config.js";
import { createPlan } from "../src/plan.js";
import { policies } from "../src/policy.js";
import { statePath } from "../src/state.js";
import { fixture, write } from "./helpers.js";

test("policy is validated, selected, and sorted", () => {
  const item = fixture();
  write(path.join(item.repo, ".github/teams-sample-sync/migration-policy.yml"), `version: 1
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
  write(path.join(item.repo, ".github/teams-sample-sync/migration-policy.yml"), `version: 1
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
  const file = path.join(item.repo, ".github/teams-sample-sync/migration-policy.yml");
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
  const policyFile = path.join(item.repo, ".github/teams-sample-sync/migration-policy.yml");
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
  const targetsFile = path.join(item.repo, ".github/teams-sample-sync/targets.yml");
  write(targetsFile, readFileSync(targetsFile, "utf8").replace("destination: sample-a", "destination: ../../escape"));
  assert.throws(() => targets(item.repo), /unsafe path/);
});

test("Copilot model and reasoning effort are validated and tracked as sync input", () => {
  const item = fixture();
  const configured = targets(item.repo);
  assert.deepEqual(configured.copilot, { model: "gpt-5.4", reasoningEffort: "high" });

  const first = createPlan(item.repo, item.upstream);
  const entry = first.samples["sample-a"]!;
  write(statePath(item.repo, "sample-a"), `${JSON.stringify({
    version: 2, sample: "sample-a", upstreamCommit: entry.upstreamCommit, sourceTree: entry.sourceTree,
    inputDigest: entry.inputDigest, outputDigest: "output", componentDigests: entry.componentDigests, status: "verified",
  }, null, 2)}\n`);
  const targetsFile = path.join(item.repo, ".github/teams-sample-sync/targets.yml");
  const original = readFileSync(targetsFile, "utf8");
  write(targetsFile, original.replace("reasoningEffort: high", "reasoningEffort: medium"));
  assert.deepEqual(createPlan(item.repo, item.upstream).samples["sample-a"]!.changedComponents, ["copilot"]);

  write(targetsFile, original.replace("reasoningEffort: high", "reasoningEffort: extreme"));
  assert.throws(() => targets(item.repo), /reasoningEffort must be one of/);
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
