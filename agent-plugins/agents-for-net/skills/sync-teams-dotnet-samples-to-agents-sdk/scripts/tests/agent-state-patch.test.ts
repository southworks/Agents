import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { attempts, buildAgentPrompt, parseAgentResult, runAgentLoop, type AgentRunner } from "../src/agent-runner.js";
import { main } from "../src/cli.js";
import { createContext } from "../src/context.js";
import { changedPaths, digestDirectory } from "../src/git.js";
import { createPlan } from "../src/plan.js";
import { createState, statePath, validateState } from "../src/state.js";
import type { AgentResult, SyncContext, SyncResult, ValidationResult } from "../src/types.js";
import { fixture, git, gitBuffer, write } from "./helpers.js";

function agent(status: AgentResult["status"] = "updated"): AgentResult {
  return {
    version: 1,
    sample: "sample-a",
    status,
    summary: "Migrated sample.",
    upstreamChanges: [],
    preservedDifferences: [],
    appliedPolicies: [],
    manifestReport: { mode: "complete", changes: [], validation: [], externalSetup: [] },
  };
}

function validation(passed: boolean, digest: string, errors: string[] = []): ValidationResult {
  return {
    version: 1, sample: "sample-a", passed, repairable: true, outputDigest: digest,
    checks: { project: passed, restore: passed, build: passed, manifest: passed, httpSmoke: passed, contracts: passed },
    errors, externalValidationRequired: [],
  };
}

test("agent result schema and attempt cap are enforced", () => {
  assert.equal(attempts(undefined), 5);
  assert.equal(attempts(1), 1);
  assert.throws(() => attempts(6), /1 to 5/);
  assert.equal(parseAgentResult(agent(), "sample-a").status, "updated");
  assert.throws(() => parseAgentResult({ ...agent(), sample: "wrong" }, "sample-a"), /invalid version, sample, or status/);
  assert.throws(() => parseAgentResult({ ...agent(), status: "needs-policy" }, "sample-a"), /policyRequest/);
});

test("agent prompt identifies the complete allowed policy key list", () => {
  const item = fixture();
  const prompt = buildAgentPrompt(item.repo, path.join(item.repo, ".sync/context.json"), false, []);
  assert.match(prompt, /Allowed migration policy keys: \[\]/);
  assert.match(prompt, /complete final migration, including changes made before any repair pass/);
});

test("migrate rejects Copilot configuration drift from its plan", async () => {
  const item = fixture();
  const plan = createPlan(item.repo, item.upstream, "sample-a");
  const planFile = path.join(item.repo, ".sync/plan.json");
  write(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  const targetsFile = path.join(item.repo, ".github/teams-sample-sync/targets.yml");
  write(targetsFile, readFileSync(targetsFile, "utf8").replace("model: gpt-5.4", "model: changed-model"));

  const exit = await main([
    "migrate", "--repo-root", item.repo, "--upstream-root", item.upstream,
    "--plan", planFile, "--sample", "sample-a", "--output-directory", path.join(item.repo, ".sync/output"),
  ]);
  assert.equal(exit, 2);
});

test("repair loop receives only exact verifier errors and stops after success", async () => {
  const item = fixture();
  const plan = createPlan(item.repo, item.upstream, "sample-a");
  const context = createContext(item.repo, item.upstream, plan, "sample-a");
  const baseSha = git(item.repo, "rev-parse", "HEAD");
  let runs = 0;
  const runner: AgentRunner = {
    run: ({ contextFile }) => {
      runs += 1;
      if (runs === 2) {
        const value = JSON.parse(readFileSync(contextFile, "utf8")) as SyncContext;
        assert.deepEqual(value.validationErrors, ["exact build error"]);
      }
      write(path.join(item.repo, "samples/dotnet/teams/sample-a/value.txt"), `attempt ${runs}\n`);
      return Promise.resolve(agent());
    },
  };
  const validationPasses = [false, true];
  const entry = plan.samples["sample-a"]!;
  const result = await runAgentLoop({
    repo: item.repo, upstream: item.upstream, baseSha, sample: "sample-a",
    sampleRoot: "samples/dotnet/teams/sample-a",
    sourcePath: "samples/TeamsSDK/sample-a/dotnet/sample-a",
    upstreamCommit: entry.upstreamCommit!, sourceTree: entry.sourceTree!,
    protectedPaths: ["**/manifest-evidence.md"], outputDigestExcludes: [], policyKeys: [], context, maxAttempts: 5, runner,
    validate: () => {
      const passed = validationPasses.shift()!;
      return Promise.resolve(validation(passed, digestDirectory(path.join(item.repo, "samples/dotnet/teams/sample-a")), passed ? [] : ["exact build error"]));
    },
  });
  assert.equal(result.attempts, 2);
  assert.equal(result.validation.passed, true);
});

test("agent loop repairs an invalid policy report before validation", async () => {
  const item = fixture();
  const plan = createPlan(item.repo, item.upstream, "sample-a");
  const entry = plan.samples["sample-a"]!;
  const context = createContext(item.repo, item.upstream, plan, "sample-a");
  let runs = 0;
  let validations = 0;
  const result = await runAgentLoop({
    repo: item.repo, upstream: item.upstream, baseSha: git(item.repo, "rev-parse", "HEAD"), sample: "sample-a",
    sampleRoot: "samples/dotnet/teams/sample-a", sourcePath: "samples/TeamsSDK/sample-a/dotnet/sample-a",
    upstreamCommit: entry.upstreamCommit!, sourceTree: entry.sourceTree!, protectedPaths: [], outputDigestExcludes: [], policyKeys: [],
    context, maxAttempts: 5,
    runner: {
      run: ({ contextFile }) => {
        runs += 1;
        if (runs === 2) {
          const value = JSON.parse(readFileSync(contextFile, "utf8")) as SyncContext;
          assert.deepEqual(value.validationErrors, ["Agent policy report mismatch; unknown=migration skill step; missing="]);
        }
        return Promise.resolve({ ...agent(), appliedPolicies: runs === 1 ? ["migration skill step"] : [] });
      },
    },
    validate: () => {
      validations += 1;
      const sampleRoot = path.join(item.repo, "samples/dotnet/teams/sample-a");
      return Promise.resolve(validation(true, digestDirectory(sampleRoot)));
    },
  });
  assert.equal(result.attempts, 2);
  assert.equal(validations, 1);
});

test("agent loop does not retry infrastructure failures", async () => {
  const item = fixture();
  const plan = createPlan(item.repo, item.upstream, "sample-a");
  const entry = plan.samples["sample-a"]!;
  const context = createContext(item.repo, item.upstream, plan, "sample-a");
  let runs = 0;
  await assert.rejects(() => runAgentLoop({
    repo: item.repo, upstream: item.upstream, baseSha: git(item.repo, "rev-parse", "HEAD"), sample: "sample-a",
    sampleRoot: "samples/dotnet/teams/sample-a", sourcePath: "samples/TeamsSDK/sample-a/dotnet/sample-a",
    upstreamCommit: entry.upstreamCommit!, sourceTree: entry.sourceTree!, protectedPaths: [], outputDigestExcludes: [], policyKeys: [],
    context, maxAttempts: 5, runner: { run: () => { runs += 1; return Promise.resolve(agent()); } },
    validate: () => Promise.reject(new Error("feed unavailable")),
  }), /feed unavailable/);
  assert.equal(runs, 1);
});

test("post-validation guard rejects candidate build-time writes", async () => {
  const item = fixture();
  const plan = createPlan(item.repo, item.upstream, "sample-a");
  const entry = plan.samples["sample-a"]!;
  const context = createContext(item.repo, item.upstream, plan, "sample-a");
  await assert.rejects(() => runAgentLoop({
    repo: item.repo, upstream: item.upstream, baseSha: git(item.repo, "rev-parse", "HEAD"), sample: "sample-a",
    sampleRoot: "samples/dotnet/teams/sample-a", sourcePath: "samples/TeamsSDK/sample-a/dotnet/sample-a",
    upstreamCommit: entry.upstreamCommit!, sourceTree: entry.sourceTree!, protectedPaths: [], outputDigestExcludes: [], policyKeys: [],
    context, maxAttempts: 1, runner: { run: () => Promise.resolve(agent()) },
    validate: () => {
      const sampleRoot = path.join(item.repo, "samples/dotnet/teams/sample-a");
      write(path.join(sampleRoot, "changed-by-build.cs"), "unsafe\n");
      return Promise.resolve(validation(true, digestDirectory(sampleRoot)));
    },
  }), /changed selected-sample source/);
});

test("version-2 state is created only from successful validation", () => {
  const item = fixture();
  const entry = createPlan(item.repo, item.upstream, "sample-a").samples["sample-a"]!;
  assert.throws(() => createState("sample-a", entry, validation(false, "bad", ["failure"])), /successful validation/);
  const state = createState("sample-a", entry, validation(true, "output"));
  validateState(state, "sample-a");
  assert.equal(state.version, 2);
  assert.equal(state.outputDigest, "output");
});

test("verify-patch accepts only the applied validated sample and state", async () => {
  const item = fixture();
  const plan = createPlan(item.repo, item.upstream, "sample-a");
  const entry = plan.samples["sample-a"]!;
  const baseSha = git(item.repo, "rev-parse", "HEAD");
  const sampleRoot = path.join(item.repo, "samples/dotnet/teams/sample-a");
  write(path.join(sampleRoot, "value.txt"), "validated output\n");
  const outputDigest = digestDirectory(sampleRoot, ["bin/**", "obj/**"]);
  const checked = validation(true, outputDigest);
  const state = createState("sample-a", entry, checked);
  write(statePath(item.repo, "sample-a"), `${JSON.stringify(state, null, 2)}\n`);
  git(item.repo, "add", "-N", "--", "samples/dotnet/teams/sample-a", ".github/teams-sample-sync/state/sample-a.lock.json");
  const resultDirectory = path.join(item.repo, ".sync/result");
  const patch = gitBuffer(item.repo, "diff", "--binary", baseSha, "--", "samples/dotnet/teams/sample-a", ".github/teams-sample-sync/state/sample-a.lock.json");
  write(path.join(resultDirectory, "change.patch"), patch);
  const result: SyncResult = {
    version: 2, sample: "sample-a", status: "updated", publishable: true, baseSha,
    previousUpstreamCommit: null, upstreamCommit: entry.upstreamCommit!, upstreamChanges: [],
    changedComponents: entry.changedComponents, destinationChanges: changedPaths(item.repo, baseSha),
    copilot: { model: "gpt-5.4", reasoningEffort: "high" }, migrationPolicies: [],
    sourceTree: entry.sourceTree!, inputDigest: entry.inputDigest!,
    componentDigests: entry.componentDigests!, outputDigest, state, agent: agent(), validation: checked,
  };
  const resultFile = path.join(resultDirectory, "sync-result.json");
  write(resultFile, `${JSON.stringify(result, null, 2)}\n`);
  const exit = await main(["verify-patch", "--repo-root", item.repo, "--sample", "sample-a", "--result", resultFile]);
  assert.equal(exit, 0);
  write(resultFile, `${JSON.stringify({ ...result, copilot: { ...result.copilot, model: "changed-model" } }, null, 2)}\n`);
  assert.equal(await main(["verify-patch", "--repo-root", item.repo, "--sample", "sample-a", "--result", resultFile]), 2);
  write(resultFile, `${JSON.stringify(result, null, 2)}\n`);
  write(path.join(item.repo, "outside.txt"), "not allowed\n");
  assert.equal(await main(["verify-patch", "--repo-root", item.repo, "--sample", "sample-a", "--result", resultFile]), 2);
  rmSync(path.join(item.repo, "outside.txt"));
  write(path.join(sampleRoot, "manifest-evidence.md"), "not allowed\n");
  assert.equal(await main(["verify-patch", "--repo-root", item.repo, "--sample", "sample-a", "--result", resultFile]), 2);
  rmSync(path.join(sampleRoot, "manifest-evidence.md"));
  write(path.join(item.repo, ".github/teams-sample-sync/migration-policy.yml"), "version: 1\npolicies:\n  - changed\n");
  assert.equal(await main(["verify-patch", "--repo-root", item.repo, "--sample", "sample-a", "--result", resultFile]), 2);
  write(path.join(item.repo, ".github/teams-sample-sync/migration-policy.yml"), "version: 1\npolicies: []\n");
  const badResult = { ...result, outputDigest: "sha256:bad", validation: { ...checked, outputDigest: "sha256:bad" } };
  write(resultFile, `${JSON.stringify(badResult, null, 2)}\n`);
  assert.equal(await main(["verify-patch", "--repo-root", item.repo, "--sample", "sample-a", "--result", resultFile]), 2);
});
