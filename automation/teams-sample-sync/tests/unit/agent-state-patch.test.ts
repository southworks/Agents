import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { main, migrateCandidate } from "../../src/cli.js";
import type { SdkClient, SdkSession } from "../../src/agent-runner.js";
import type { SessionConfig } from "@github/copilot-sdk";
import { targets } from "../../src/config.js";
import { createContext } from "../../src/context.js";
import { changedPaths, digestDirectory, hash, stable } from "../../src/git.js";
import { createPlan } from "../../src/plan.js";
import { evidenceDigest } from "../../src/review.js";
import { blockingRecord } from "../../src/report.js";
import { createState, statePath, validateState } from "../../src/state.js";
import type { AgentResult, SyncContext, SyncResult, ValidationResult } from "../../src/types.js";
import { fixture, git, gitBuffer, write } from "./helpers.js";

test("failed report submission preserves validation artifacts and never publishes", async () => {
  const item = fixture();
  const output = path.join(item.repo, ".sync/output");
  const root = path.join(item.repo, "samples/dotnet/teams/sample-a");
  write(path.join(root, "Sample.csproj"), '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.Agents.Hosting.AspNetCore" Version="1.7.*" /><PackageReference Include="Microsoft.Agents.Extensions.MSTeams" Version="1.7.*" /><PackageReference Include="Microsoft.Agents.Authentication.Msal" Version="1.7.*" /></ItemGroup></Project>');
  write(path.join(root, "Program.cs"), "builder.AddAgentDefaults().AddAgent<SampleAgent>(); app.UseAgents(); app.MapDefaultAgentEndpoints(); [TeamsExtension] partial class SampleAgent : AgentApplication {}");
  write(path.join(root, "appManifest/manifest.json"), JSON.stringify({ $schema: "https://developer.microsoft.com/json-schemas/teams/v1.22/MicrosoftTeams.schema.json", manifestVersion: "1.22", version: "1.0.0", id: "${{CLIENT_ID}}", name: { short: "Sample" }, description: { short: "Sample", full: "Sample" }, icons: { color: "color.png", outline: "outline.png" }, bots: [{ botId: "${{CLIENT_ID}}", scopes: ["personal"] }] }));
  const planFile = path.join(item.repo, ".sync/plan.json");
  write(planFile, JSON.stringify(createPlan(item.repo, item.upstream)));
  let config: SessionConfig;
  let checked: ValidationResult | undefined;
  let sessions = 0;
  const call = async (name: string, input: unknown) => {
    const tool = config.tools!.find((tool) => tool.name === name)!;
    return tool.handler!(input, { sessionId: "test", toolCallId: name, toolName: name, arguments: input });
  };
  const session: SdkSession = {
    on: (() => () => {}) as SdkSession["on"], abort: async () => {}, disconnect: async () => {},
    sendAndWait: async () => {
      checked = await call("validate_sample", { group: "all" }) as ValidationResult;
      assert.equal(checked.passed, true, checked.errors.join("; "));
      for (const summary of ["first attempt", "different summary"]) {
        const feedback = await call("submit_result", { summary }) as { accepted: boolean; error: string };
        assert.equal(feedback.accepted, false);
        assert.match(feedback.error, /Invalid implementation fields/);
      }
      return undefined;
    },
  };
  const client: SdkClient = { start: async () => {}, stop: async () => [], listModels: async () => [], getStatus: async () => ({ version: "1.0.83", protocolVersion: 3 }), getAuthStatus: async () => ({ isAuthenticated: true }), createSession: async (value) => { config = value; sessions++; return session; } };
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "offline-test-token";
  try {
    const code = await migrateCandidate(item.repo, { "upstream-root": item.upstream, plan: planFile, sample: "sample-a", "output-directory": output }, { sdkFactory: async () => client, validationRuntime: { runCommand: () => [], runHttpSmoke: async () => [], loadSchema: async () => ({ type: "object" }) } });
    assert.equal(code, 1);
    const result = JSON.parse(readFileSync(path.join(output, "sync-result.json"), "utf8")) as SyncResult;
    assert.deepEqual(result.validation, checked);
    assert.equal(result.publishable, false);
    assert.equal(result.metrics.rejectedImplementerReports, 2);
    assert.match(result.error!, /Report correction made no progress/);
    assert.equal(sessions, 1, "review must not start without accepted evidence");
    assert.equal(existsSync(path.join(output, "change.patch")), false);
    assert.equal(existsSync(statePath(item.repo, "sample-a")), false);
    const events = readFileSync(path.join(output, "agent-events.jsonl"), "utf8");
    assert.match(events, /validation-completed/);
    assert.match(events, /submission-rejected/);
  } finally {
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = previousToken;
    rmSync(item.root, { recursive: true, force: true });
  }
});
function validation(passed: boolean, outputDigest: string): ValidationResult {
  return { version: 2, id: "validation-1", sample: "sample-a", passed, repairable: true, outputDigest, group: "all", checks: Object.fromEntries(["project", "restore", "build", "manifest", "httpSmoke", "contracts", "sampleTests"].map((name) => [name, { status: passed ? "passed" : "failed", errors: [] }])), errors: passed ? [] : ["failure"], externalValidationRequired: [] };
}
test("version-2 checkpoints require successful validation", () => {
  const item = fixture(); const entry = createPlan(item.repo, item.upstream).samples["sample-a"]!;
  assert.throws(() => createState("sample-a", entry, validation(false, "bad")), /successful validation/);
  const state = createState("sample-a", entry, validation(true, "output"));
  validateState(state, "sample-a"); assert.equal(state.version, 2);
});

test("structured unsupported results publish only a verified report patch", async () => {
  const item = fixture();
  const plan = createPlan(item.repo, item.upstream); const entry = plan.samples["sample-a"]!;
  const contextFiles = createContext(item.repo, item.upstream, plan, "sample-a"); const context = JSON.parse(readFileSync(contextFiles.file, "utf8")) as SyncContext;
  const baseSha = git(item.repo, "rev-parse", "HEAD"); const reportPath = "automation/teams-sample-sync/reports/sample-a.md";
  const agent: AgentResult = { version: 2, sample: "sample-a", status: "unsupported", summary: "The required source feature has no supported Agents equivalent.", dispositions: [], upstreamChanges: [], preservedDifferences: [], appliedPolicies: [], manifestReport: { mode: "blocked", changes: [], validation: [], externalSetup: [], capabilities: [] } };
  const result: SyncResult = { version: 3, sample: "sample-a", status: "unsupported", publishable: true, publicationKind: "report", reportPath, baseSha, previousUpstreamCommit: null, upstreamCommit: entry.upstreamCommit!, upstreamChanges: context.upstream.changes, changedComponents: entry.changedComponents, destinationChanges: [reportPath], copilot: targets(item.repo).copilot, observedModels: [], migrationPolicies: [], sourceTree: entry.sourceTree!, sourceContextDigest: hash(stable(context)), inputDigest: entry.inputDigest!, componentDigests: entry.componentDigests!, agent, metrics: { repairPasses: 0, rejectedImplementerReports: 0, rejectedReviewerReports: 0 }, diagnostics: [], error: agent.summary };
  const resultDirectory = path.join(item.repo, ".sync/report"); write(path.join(resultDirectory, "source-context.json"), JSON.stringify(context));
  write(path.join(item.repo, reportPath), blockingRecord(result)); git(item.repo, "add", "-N", "--", reportPath);
  write(path.join(resultDirectory, "change.patch"), gitBuffer(item.repo, "diff", "--binary", baseSha, "--", reportPath));
  const resultFile = path.join(resultDirectory, "sync-result.json"); write(resultFile, JSON.stringify(result));
  try {
    assert.equal(await main(["verify-patch", "--repo-root", item.repo, "--sample", "sample-a", "--result", resultFile]), 0);
    write(path.join(item.repo, "samples/dotnet/teams/sample-a/unauthorized.cs"), "partial candidate");
    assert.equal(await main(["verify-patch", "--repo-root", item.repo, "--sample", "sample-a", "--result", resultFile]), 2, "report PRs must never include partial migration files");
  } finally { rmSync(item.root, { recursive: true, force: true }); }
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
  const result: SyncResult = { version: 3, sample: "sample-a", status: "updated", publishable: true, publicationKind: "update", baseSha, previousUpstreamCommit: null, upstreamCommit: entry.upstreamCommit!, upstreamChanges: context.upstream.changes, changedComponents: entry.changedComponents, destinationChanges: changedPaths(item.repo, baseSha), copilot: targets(item.repo).copilot, observedModels: [], migrationPolicies: [], sourceTree: entry.sourceTree!, sourceContextDigest: hash(stable(context)), inputDigest: entry.inputDigest!, componentDigests: entry.componentDigests!, outputDigest, evidenceDigest: evidenceDigest(agent), state, agent, validation: checked, review: { outputDigest, evidenceDigest: evidenceDigest(agent), validationId: checked.id, result: { version: 2, sample: "sample-a", verdict: "approved", summary: "Reviewed", reviewedChangeIds: context.changes.map((change) => change.id), reviewedCapabilityIds: ["base-bot"], findings: [], resolvedFindingIds: [], testAssessment: "Fixture checked", coverageLimitations: [] } }, metrics: { repairPasses: 0, rejectedImplementerReports: 0, rejectedReviewerReports: 0 }, diagnostics: [] };
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
