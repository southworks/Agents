import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { inspectManifestSchema, schemaDefinition, submitResult, type ToolHost } from "../../src/agent-tools.js";
import { digestDirectory } from "../../src/git.js";
import type { AgentResult, SyncContext, Targets, ValidationResult } from "../../src/types.js";
import { fixture, git, write } from "./helpers.js";

const released = "https://developer.microsoft.com/json-schemas/teams/v1.22/MicrosoftTeams.schema.json";
const schema = { type: "object", definitions: { bot: { type: "object", properties: { botId: { type: "string" } } } }, properties: { permissions: { type: "array", items: { enum: ["identity", "messageTeamMembers"] } }, bots: { type: "array", items: { allOf: [{ $ref: "#/definitions/bot" }, { oneOf: [{ properties: { scopes: { type: "array", items: { type: "string" } } } }] }] } } } };

test("manifest inspection resolves array items, local references, and alternatives", () => {
  assert.deepEqual(schemaDefinition(schema, "bots[0].botId"), [{ type: "string" }]);
  assert.deepEqual(schemaDefinition(schema, "bots[0].scopes[1]"), [{ type: "string" }]);
  assert.deepEqual(schemaDefinition(schema, "bots[0].permissions"), []);
  assert.equal(schemaDefinition(schema, "permissions").length, 1);
  assert.throws(() => schemaDefinition(schema, "../permissions"), /concrete manifest path/);
  assert.throws(() => schemaDefinition({ $ref: "https://untrusted/schema" }, "field"), /local released-schema references/);
});

function hostFixture() {
  const environment = fixture();
  const sampleRoot = "samples/dotnet/teams/sample-a";
  write(path.join(environment.repo, sampleRoot, "appManifest/manifest.json"), JSON.stringify({ $schema: released, manifestVersion: "1.22", bots: [{ botId: "fixture" }] }));
  const contextRoot = path.join(environment.root, "context"); write(path.join(contextRoot, "source.json"), "{}");
  const manifest = { distribution: "sample", packageDirectory: "appManifest", placeholderConvention: "double-braces" };
  const context = { version: 1, sample: "sample-a", changes: [{ id: "change", path: "old.txt", diff: "delta" }], paths: { destination: sampleRoot }, manifest, policies: [] } as unknown as SyncContext;
  const configured = { samples: { "sample-a": { manifest } } } as unknown as Targets;
  const accepted: AgentResult[] = [];
  const host: ToolHost = { repo: environment.repo, upstream: environment.upstream, baseSha: git(environment.repo, "rev-parse", "HEAD"), sampleRoot, sourcePath: "samples/TeamsSDK/sample-a/dotnet/sample-a", upstreamCommit: environment.firstUpstreamCommit, sourceTree: git(environment.upstream, "rev-parse", `${environment.firstUpstreamCommit}:samples/TeamsSDK/sample-a/dotnet/sample-a`), protectedPaths: [], excludes: [], contextRoot, contextDigest: digestDirectory(contextRoot), context, configured, acceptImplementation: (value) => accepted.push(value), acceptReview: () => {} };
  const result: AgentResult = { version: 2, sample: "sample-a", status: "updated", summary: "ported", dispositions: [{ changeId: "change", decision: "adapted", explanation: "ported", destinationPath: `${sampleRoot}/value.txt`, symbol: "value", verification: "test" }], upstreamChanges: [], preservedDifferences: [], appliedPolicies: [], manifestReport: { mode: "complete", changes: [], validation: ["schema passed"], externalSetup: [], capabilities: [{ id: "bot", kind: "bot", evidence: ["old.txt"], decision: "manifest-field-required", manifestPath: "bots[0].botId", reference: "manifest skill" }] } };
  const validation: ValidationResult = { version: 2, id: "check", sample: "sample-a", passed: true, repairable: true, outputDigest: digestDirectory(path.join(environment.repo, sampleRoot)), group: "all", checks: Object.fromEntries(["project", "restore", "build", "manifest", "httpSmoke"].map((name) => [name, { status: "passed", errors: [] }])), errors: [], externalValidationRequired: [] };
  return { environment, host, result, validation, accepted };
}

test("submission rejects missing or stale validation and missing capability evidence immediately", async () => {
  const { environment, host, result, validation, accepted } = hostFixture();
  try {
    await assert.rejects(submitResult(host, result), /requires validate_sample/);
    host.lastValidation = { ...validation, outputDigest: "stale" };
    await assert.rejects(submitResult(host, result), /stale validation/);
    host.lastValidation = validation;
    const invalid = structuredClone(result); invalid.manifestReport.capabilities[0]!.evidence = [];
    await assert.rejects(submitResult(host, invalid), /Invalid implementation fields/);
    await assert.rejects(submitResult(host, { ...result, dispositions: [] }), /each source change ID/);
    assert.equal(accepted.length, 0);
    await submitResult(host, result); assert.equal(accepted.length, 1);
  } finally { rmSync(environment.root, { recursive: true, force: true }); }
});

test("unsupported submission is accepted without running validation", async () => {
  const { environment, host, result, accepted } = hostFixture();
  try {
    await submitResult(host, { version: 2, sample: "sample-a", status: "unsupported", summary: "No supported Agents equivalent exists." });
    assert.deepEqual(accepted, [{ ...result, status: "unsupported", summary: "No supported Agents equivalent exists.", dispositions: [], upstreamChanges: [], preservedDifferences: [], appliedPolicies: [], manifestReport: { mode: "blocked", changes: [], validation: [], externalSetup: [], capabilities: [] } }]);
  }
  finally { rmSync(environment.root, { recursive: true, force: true }); }
});

test("submission diagnostics identify the incorrect evidence field and correction", async () => {
  const { environment, host, result, validation } = hostFixture();
  try {
    host.lastValidation = validation;
    const invalid = structuredClone(result);
    invalid.dispositions[0]!.destinationPath = "Properties/launchSettings.EXAMPLE.json";
    await assert.rejects(submitResult(host, invalid), /Invalid destination evidence:.*received "Properties\/launchSettings.EXAMPLE.json".*path must be inside samples\/dotnet\/teams\/sample-a\//);
    invalid.dispositions[0]!.destinationPath = `${host.sampleRoot}/missing.json`;
    await assert.rejects(submitResult(host, invalid), /file does not exist.*Set destinationPath/);
    invalid.dispositions = result.dispositions;
    invalid.manifestReport.capabilities[0]!.decision = "no-manifest-field";
    await assert.rejects(submitResult(host, invalid), /Set manifestPath to the literal string "none"/);
  } finally { rmSync(environment.root, { recursive: true, force: true }); }
});

test("schema inspection shares cached released content across calls", async () => {
  const { environment, host } = hostFixture(); let loads = 0;
  host.validationRuntime = { runCommand: () => [], runHttpSmoke: async () => [], loadSchema: async () => { loads++; return schema; } };
  try {
    const result = await Promise.all([inspectManifestSchema(host, "bots[0].botId"), inspectManifestSchema(host, "bots[0].permissions")]);
    assert.equal(loads, 1); assert.equal(result[0]!.defined, true); assert.equal(result[1]!.defined, false);
  } finally { rmSync(environment.root, { recursive: true, force: true }); }
});
