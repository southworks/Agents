import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";

import { parse, stringify } from "yaml";

import {
  SyncError,
  buildAgentInput,
  buildPlan,
  captureProposal,
  directoryDigest,
  finalizeState,
  main,
  ownershipClass,
  verifySample,
} from "../sync.js";

type Data = Record<string, unknown>;

function run(cwd: string, ...args: string[]): void {
  const result = spawnSync(args[0]!, args.slice(1), { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, String(result.stderr));
}

function asRecord(value: unknown): Data {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Data;
}

class SyncFixture {
  readonly repository: string;
  readonly upstream: string;
  readonly config: string;

  constructor(readonly root: string) {
    this.repository = path.join(root, "target");
    this.upstream = path.join(root, "upstream");
    this.config = path.join(this.repository, ".github", "teams-sample-sync");
    mkdirSync(this.repository);
    mkdirSync(this.upstream);
    mkdirSync(this.config, { recursive: true });
    this.writeTargetRepository();
    this.writeUpstreamRepository();
  }

  private writeTargetRepository(): void {
    const targets = {
      version: 1,
      upstream: { repository: "example/upstream", ref: "main", root: "samples/TeamsSDK" },
      destinationRoot: "samples/dotnet/teams",
      canonicalSample: "samples/dotnet/quickstart",
      migrationSkill: "skills/migration",
      manifestSkill: "skills/manifest",
      packagePolicy: { targetFramework: "net8.0", agentsSdkVersion: "1.7.*" },
      validatorVersion: "1",
      samples: {
        "sample-a": {
          source: "sample-a/dotnet/sample-a",
          destination: "sample-a",
          manifest: {
            distribution: "sample",
            packageDirectory: "appManifest",
            placeholderConvention: "double-braces",
          },
        },
      },
    };
    const ownership = {
      version: 1,
      precedence: ["human-owned", "agents-owned", "generated", "upstream-owned"],
      classes: {
        "human-owned": ["manifest-evidence.md"],
        "agents-owned": ["Program.cs"],
        generated: ["appManifest/manifest.json"],
        "upstream-owned": ["**"],
      },
      outputDigestExcludes: ["bin/**", "obj/**"],
    };
    writeFileSync(path.join(this.config, "targets.yml"), stringify(targets), "utf8");
    writeFileSync(path.join(this.config, "decisions.yml"), "version: 1\ndecisions: []\n", "utf8");
    writeFileSync(path.join(this.config, "ownership.yml"), stringify(ownership), "utf8");
    mkdirSync(path.join(this.config, "state"));
    for (const relative of ["skills/migration", "skills/manifest"]) {
      const directory = path.join(this.repository, relative);
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, "SKILL.md"), relative, "utf8");
    }
    const quickstart = path.join(this.repository, "samples", "dotnet", "quickstart");
    mkdirSync(path.join(quickstart, "Properties"), { recursive: true });
    writeFileSync(
      path.join(quickstart, "appsettings.json"),
      '{"Logging":{"LogLevel":{"Default":"Information"}}}',
      "utf8",
    );
    writeFileSync(
      path.join(quickstart, "Properties", "launchSettings.json"),
      '{"profiles":{"QuickStart":{"commandName":"Project"}}}',
      "utf8",
    );
  }

  private writeUpstreamRepository(): void {
    run(this.upstream, "git", "init", "-q");
    run(this.upstream, "git", "config", "user.email", "sync@example.com");
    run(this.upstream, "git", "config", "user.name", "Sync Test");
    const sample = path.join(
      this.upstream,
      "samples",
      "TeamsSDK",
      "sample-a",
      "dotnet",
      "sample-a",
    );
    mkdirSync(sample, { recursive: true });
    writeFileSync(path.join(sample, "Program.cs"), "upstream", "utf8");
    run(this.upstream, "git", "add", ".");
    run(this.upstream, "git", "commit", "-qm", "initial");
  }

  plan(): Data {
    return buildPlan({ repoRoot: this.repository, upstreamRoot: this.upstream });
  }
}

describe("Teams sample synchronization", () => {
  let temporaryRoot: string;
  let fixture: SyncFixture;

  beforeEach(() => {
    temporaryRoot = mkdtempSync(path.join(tmpdir(), "teams-sample-sync-"));
    fixture = new SyncFixture(temporaryRoot);
  });

  afterEach(() => rmSync(temporaryRoot, { recursive: true, force: true }));

  test("plan becomes unchanged after state matches", () => {
    const first = fixture.plan();
    const samples = asRecord(first.samples);
    const sample = asRecord(samples["sample-a"]);
    assert.equal(sample.requiresAgent, true);
    writeFileSync(
      path.join(fixture.config, "state", "sample-a.lock.json"),
      JSON.stringify({
        version: 1,
        sample: "sample-a",
        inputDigest: sample.inputDigest,
        componentDigests: sample.componentDigests,
      }),
      "utf8",
    );
    const second = fixture.plan();
    const secondSample = asRecord(asRecord(second.samples)["sample-a"]);
    assert.equal(secondSample.status, "unchanged");
    assert.deepEqual(second.matrix, []);
  });

  test("agent input excludes stale state and digest metadata", async () => {
    const planPath = path.join(temporaryRoot, "plan.json");
    const outputPath = path.join(temporaryRoot, "agent-input.json");
    const plan = fixture.plan();
    writeFileSync(planPath, JSON.stringify(plan), "utf8");

    const input = buildAgentInput({
      repoRoot: fixture.repository,
      plan: planPath,
      sample: "sample-a",
    });
    const sample = asRecord(input.sample);

    assert.equal(input.sampleName, "sample-a");
    assert.equal(input.upstreamCommit, plan.upstreamCommit);
    assert.deepEqual(input.repository, {
      upstream: { repository: "example/upstream", ref: "main", root: "samples/TeamsSDK" },
      destinationRoot: "samples/dotnet/teams",
      canonicalSample: "samples/dotnet/quickstart",
      migrationSkill: "skills/migration",
      manifestSkill: "skills/manifest",
      packagePolicy: { targetFramework: "net8.0", agentsSdkVersion: "1.7.*" },
    });
    assert.deepEqual(Object.keys(sample).sort(), [
      "changedComponents",
      "decisions",
      "destination",
      "ownership",
      "sourceTree",
      "status",
      "target",
      "upstreamCommit",
    ]);
    assert.equal("previousState" in sample, false);
    assert.equal("componentDigests" in sample, false);
    assert.equal("inputDigest" in sample, false);
    assert.deepEqual(sample.decisions, asRecord(asRecord(plan.samples)["sample-a"]).decisions);

    assert.equal(
      await main([
        "--repo-root",
        fixture.repository,
        "agent-input",
        "--plan",
        planPath,
        "--sample",
        "sample-a",
        "--output",
        outputPath,
      ]),
      0,
    );
    assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), input);
  });

  test("skill change requires reconciliation", () => {
    const first = fixture.plan();
    const sample = asRecord(asRecord(first.samples)["sample-a"]);
    writeFileSync(
      path.join(fixture.config, "state", "sample-a.lock.json"),
      JSON.stringify({
        version: 1,
        sample: "sample-a",
        inputDigest: sample.inputDigest,
        componentDigests: sample.componentDigests,
      }),
      "utf8",
    );
    writeFileSync(path.join(fixture.repository, "skills", "migration", "SKILL.md"), "changed", "utf8");
    const second = asRecord(asRecord(fixture.plan().samples)["sample-a"]);
    assert.equal(second.requiresAgent, true);
    assert.ok((second.changedComponents as string[]).includes("migrationSkill"));
  });

  test("unselected language change does not require reconciliation", () => {
    const first = fixture.plan();
    const sample = asRecord(asRecord(first.samples)["sample-a"]);
    writeFileSync(
      path.join(fixture.config, "state", "sample-a.lock.json"),
      JSON.stringify({
        version: 1,
        sample: "sample-a",
        inputDigest: sample.inputDigest,
        componentDigests: sample.componentDigests,
      }),
      "utf8",
    );
    const sibling = path.join(
      fixture.upstream,
      "samples",
      "TeamsSDK",
      "sample-a",
      "nodejs",
      "sample-a",
    );
    mkdirSync(sibling, { recursive: true });
    writeFileSync(path.join(sibling, "index.ts"), "unrelated", "utf8");
    run(fixture.upstream, "git", "add", ".");
    run(fixture.upstream, "git", "commit", "-qm", "nodejs-only");
    const second = fixture.plan();
    assert.equal(asRecord(asRecord(second.samples)["sample-a"]).status, "unchanged");
    assert.deepEqual(second.matrix, []);
  });

  test("reports new upstream candidate", () => {
    const candidate = path.join(
      fixture.upstream,
      "samples",
      "TeamsSDK",
      "sample-b",
      "dotnet",
      "sample-b",
    );
    mkdirSync(candidate, { recursive: true });
    writeFileSync(path.join(candidate, "Program.cs"), "candidate", "utf8");
    run(fixture.upstream, "git", "add", ".");
    run(fixture.upstream, "git", "commit", "-qm", "candidate");
    assert.deepEqual(fixture.plan().newSampleCandidates, ["sample-b"]);
  });

  test("ownership uses declared precedence", () => {
    const ownership = parse(readFileSync(path.join(fixture.config, "ownership.yml"), "utf8"));
    assert.equal(ownershipClass("Program.cs", ownership), "agents-owned");
    assert.equal(ownershipClass("appManifest/manifest.json", ownership), "generated");
    assert.equal(ownershipClass("README.md", ownership), "upstream-owned");
  });

  test("verify CLI reports manifest failures in stderr", async () => {
    const sampleRoot = path.join(fixture.repository, "samples", "dotnet", "teams", "sample-a");
    mkdirSync(sampleRoot, { recursive: true });
    writeFileSync(path.join(sampleRoot, "Program.cs"), "target", "utf8");
    const output = path.join(temporaryRoot, "verification.json");
    const originalWrite = process.stderr.write;
    let stderr = "";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
    try {
      const exitCode = await main([
        "--repo-root",
        fixture.repository,
        "verify",
        "--sample",
        "sample-a",
        "--output",
        output,
      ]);
      assert.equal(exitCode, 1);
      assert.match(stderr, /Verification failed: Missing appManifest\/manifest\.json/);
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  test("proposed decision blocks verification and state advance", async () => {
    writeFileSync(
      path.join(fixture.config, "decisions.yml"),
      stringify({
        version: 1,
        decisions: [{
          id: "DEC-001",
          sample: "sample-a",
          status: "proposed",
          question: "Use candidate behavior?",
          recommendation: "Approve candidate behavior.",
          evidence: "Upstream changed.",
          impact: "Changes response.",
          invalidatesOn: "Upstream removes the behavior.",
        }],
      }),
      "utf8",
    );
    const result = await verifySample({
      repoRoot: fixture.repository,
      sample: "sample-a",
    });
    assert.equal(result.passed, false);
    assert.ok(
      (result.errors as string[]).includes("Proposed decisions require human review: DEC-001"),
    );
    const proposalResult = await verifySample({
      repoRoot: fixture.repository,
      sample: "sample-a",
      allowProposed: true,
    });
    assert.equal(proposalResult.stateEligible, false);
    assert.equal(
      (proposalResult.errors as string[]).includes("Proposed decisions require human review: DEC-001"),
      false,
    );
    const planPath = path.join(temporaryRoot, "proposed-plan.json");
    const verificationPath = path.join(temporaryRoot, "proposed-verification.json");
    writeFileSync(planPath, JSON.stringify(fixture.plan()), "utf8");
    writeFileSync(
      verificationPath,
      JSON.stringify({
        sample: "sample-a",
        passed: true,
        stateEligible: false,
        outputDigest: proposalResult.outputDigest,
      }),
      "utf8",
    );
    assert.throws(
      () => finalizeState({
        repoRoot: fixture.repository,
        sample: "sample-a",
        plan: planPath,
        firstVerification: verificationPath,
        secondVerification: verificationPath,
      }),
      /proposed decision is unresolved/,
    );
  });

  test("multiple proposals fail even in proposal mode", async () => {
    writeFileSync(
      path.join(fixture.config, "decisions.yml"),
      stringify({
        version: 1,
        decisions: [
          { id: "DEC-001", sample: "sample-a", status: "proposed" },
          { id: "DEC-002", sample: "sample-a", status: "proposed" },
        ],
      }),
      "utf8",
    );
    const result = await verifySample({
      repoRoot: fixture.repository,
      sample: "sample-a",
      allowProposed: true,
    });
    assert.equal(result.passed, false);
    assert.ok((result.errors as string[]).some((item) => item.startsWith("Only one proposed decision")));
  });

  test("captures exact tentative proposal without advancing state", () => {
    const sampleRoot = path.join(fixture.repository, "samples", "dotnet", "teams", "sample-a");
    mkdirSync(sampleRoot, { recursive: true });
    writeFileSync(path.join(sampleRoot, "Program.cs"), "before\n", "utf8");
    run(fixture.repository, "git", "init", "-q");
    run(fixture.repository, "git", "config", "core.autocrlf", "false");
    run(fixture.repository, "git", "config", "user.email", "sync@example.com");
    run(fixture.repository, "git", "config", "user.name", "Sync Test");
    run(fixture.repository, "git", "add", ".");
    run(fixture.repository, "git", "commit", "-qm", "baseline");
    const plan = fixture.plan();
    const planPath = path.join(temporaryRoot, "plan.json");
    writeFileSync(planPath, JSON.stringify(plan), "utf8");
    writeFileSync(
      path.join(fixture.config, "decisions.yml"),
      stringify({
        version: 1,
        decisions: [{
          id: "DEC-001",
          sample: "sample-a",
          status: "proposed",
          question: "Use candidate behavior?",
          recommendation: "Approve candidate behavior.",
          evidence: "Upstream changed.",
          impact: "Changes response.",
          invalidatesOn: "Upstream removes the behavior.",
        }],
      }),
      "utf8",
    );
    run(fixture.repository, "git", "add", ".github/teams-sample-sync/decisions.yml");
    run(fixture.repository, "git", "commit", "-qm", "safe proposal checkpoint");
    writeFileSync(path.join(sampleRoot, "Program.cs"), "after\n", "utf8");
    const verificationPath = path.join(temporaryRoot, "verify.json");
    writeFileSync(
      verificationPath,
      JSON.stringify({
        sample: "sample-a",
        passed: true,
        stateEligible: false,
        proposedDecisionIds: ["DEC-001"],
        outputDigest: directoryDigest(sampleRoot),
      }),
      "utf8",
    );
    const result = captureProposal({
      repoRoot: fixture.repository,
      sample: "sample-a",
      plan: planPath,
      verification: verificationPath,
    });
    assert.equal(result.stateEligible, false);
    const decisions = parse(readFileSync(path.join(fixture.config, "decisions.yml"), "utf8"));
    const proposal = decisions.decisions[0].proposal;
    assert.equal(proposal.candidateOutputDigest, directoryDigest(sampleRoot));
    assert.match(proposal.patchDigest, /^sha256:[a-f0-9]{64}$/);
    assert.ok(readFileSync(path.join(fixture.repository, proposal.patchPath), "utf8").includes("+after"));
    run(fixture.repository, "git", "apply", "--reverse", proposal.patchPath);
    assert.equal(readFileSync(path.join(sampleRoot, "Program.cs"), "utf8"), "before\n");
    assert.equal(directoryDigest(sampleRoot), proposal.baseOutputDigest);
  });

  test("finalize rejects non-idempotent output", () => {
    const planPath = path.join(temporaryRoot, "plan.json");
    const firstPath = path.join(temporaryRoot, "first.json");
    const secondPath = path.join(temporaryRoot, "second.json");
    writeFileSync(planPath, JSON.stringify(fixture.plan()), "utf8");
    writeFileSync(
      firstPath,
      JSON.stringify({ sample: "sample-a", passed: true, outputDigest: "one" }),
      "utf8",
    );
    writeFileSync(
      secondPath,
      JSON.stringify({ sample: "sample-a", passed: true, outputDigest: "two" }),
      "utf8",
    );
    assert.throws(
      () =>
        finalizeState({
          repoRoot: fixture.repository,
          sample: "sample-a",
          plan: planPath,
          firstVerification: firstPath,
          secondVerification: secondPath,
        }),
      SyncError,
    );
  });
});
