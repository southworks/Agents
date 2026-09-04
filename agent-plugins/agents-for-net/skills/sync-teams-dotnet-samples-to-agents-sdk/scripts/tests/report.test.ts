import assert from "node:assert/strict";
import test from "node:test";
import { prBody } from "../src/report.js";
import type { SyncResult } from "../src/types.js";

function result(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    version: 2,
    sample: "agent-targeted-messages",
    status: "updated",
    publishable: true,
    baseSha: "base-sha",
    previousUpstreamCommit: "teams-before",
    upstreamCommit: "teams-after",
    upstreamChanges: [{ status: "modified", oldPath: "Program.cs", newPath: "Program.cs", binary: false }],
    changedComponents: ["sourceTree", "policies"],
    copilot: { model: "gpt-5.4", reasoningEffort: "high" },
    migrationPolicies: [{
      key: "agent-targeted-messages.routing",
      sample: "agent-targeted-messages",
      instruction: "Keep the targeted message route on the Agents handler.",
      rationale: "This preserves the sample behavior.",
      source: "reviewed issue #123",
    }],
    destinationChanges: [
      "samples/dotnet/teams/agent-targeted-messages/Program.cs",
      "samples/dotnet/teams/agent-targeted-messages/appManifest/manifest.json",
      ".github/teams-sample-sync/state/agent-targeted-messages.lock.json",
    ],
    sourceTree: "source-tree",
    inputDigest: "input-digest",
    outputDigest: "output-digest",
    componentDigests: {},
    agent: {
      version: 1,
      sample: "agent-targeted-messages",
      status: "updated",
      summary: "Adapted targeted message handling to the Agents SDK.",
      upstreamChanges: ["Added targeted message routing."],
      preservedDifferences: ["Kept the Agents host startup pattern."],
      appliedPolicies: ["agent-targeted-messages.routing"],
      manifestReport: {
        mode: "complete",
        changes: ["Added the bot capability and required scopes."],
        validation: ["Manifest matches the selected sample behavior."],
        externalSetup: ["Register the bot ID before testing in Teams."],
      },
    },
    validation: {
      version: 1,
      sample: "agent-targeted-messages",
      passed: true,
      repairable: true,
      outputDigest: "output-digest",
      checks: { project: true, restore: true, build: true, manifest: true, httpSmoke: true, contracts: true },
      errors: [],
      externalValidationRequired: ["Credentialed Teams behavior"],
    },
    ...overrides,
  };
}

test("PR body explains the trigger, sample changes, policies, and validation to a human", () => {
  const body = prBody(result());

  assert.match(body, /Automated draft for one sample/);
  assert.match(body, /OfficeDev\/Microsoft-Teams-Samples/);
  assert.match(body, /Teams samples repository content changed/);
  assert.match(body, /Reviewed migration policies changed/);
  assert.match(body, /Adapted targeted message handling/);
  assert.match(body, /Added targeted message routing/);
  assert.match(body, /Program\.cs/);
  assert.match(body, /Added the bot capability and required scopes/);
  assert.match(body, /agent-targeted-messages\.routing/);
  assert.match(body, /Keep the targeted message route on the Agents handler/);
  assert.match(body, /This preserves the sample behavior/);
  assert.match(body, /reviewed issue #123/);
  assert.match(body, /Project structure and SDK migration.*one project, the target framework and Agents SDK packages, required Agents host patterns, and absence of legacy Teams SDK code/);
  assert.match(body, /Restore.*resolves the project dependencies/);
  assert.match(body, /Build.*warnings as errors/);
  assert.match(body, /Manifest.*valid JSON and unique keys, required metadata and packaged icons, the released Teams schema after placeholder substitution, and selected capabilities inferred from the sample code/);
  assert.match(body, /HTTP smoke test.*Starts the built sample and requires `GET \/` to return HTTP 200/);
  assert.match(body, /Protected behavior contracts.*sample-specific contract tests when configured/);
  assert.match(body, /Teams repository commit: `teams-after`/);
  assert.match(body, /Copilot model: `gpt-5\.4`/);
  assert.match(body, /Copilot reasoning effort: `high`/);
  assert.doesNotMatch(body, /\bupstream\b/i);
});

test("PR body identifies a first tracked synchronization without claiming a Teams repository change", () => {
  const body = prBody(result({ previousUpstreamCommit: null, upstreamChanges: [] }));

  assert.match(body, /First tracked synchronization; no earlier sync state exists/);
  assert.doesNotMatch(body, /Teams samples repository content changed/);
  assert.doesNotMatch(body, /Teams repository changes detected/);
});

test("PR body neutralizes active Markdown from report values and handles backticks in paths", () => {
  const body = prBody(result({
    destinationChanges: ["samples/`unsafe`.md"],
    agent: {
      ...result().agent!,
      summary: "[click](https://example.invalid)\n# heading @reviewers",
    },
  }));

  assert.doesNotMatch(body, /\[click\]\(https:/);
  assert.doesNotMatch(body, /\n# heading/);
  assert.doesNotMatch(body, /@reviewers/);
  assert.match(body, /`` samples\/`unsafe`\.md ``/);
});
