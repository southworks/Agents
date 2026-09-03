import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentLoopDependencies,
  DEFAULT_MAX_ATTEMPTS,
  ProtectedContext,
  buildAgentPrompt,
  runAgentValidationLoop,
  sampleRootFromAgentInput,
} from "../run-agent-loop.js";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function command(status = 0) {
  return { status, stdout: "", stderr: status === 0 ? "" : "failed" };
}

function dependencies(verifications: Array<{ passed: boolean; outputDigest: string; errors: string[] }>) {
  let verificationIndex = 0;
  const calls = { agents: 0, guards: 0, restores: 0, verifies: 0, copies: [] as string[] };
  const reports: Array<{ phase: string; level: string }> = [];
  const dependency: AgentLoopDependencies = {
    runAgent: async () => {
      calls.agents += 1;
      return command();
    },
    guard: async () => {
      calls.guards += 1;
      return command();
    },
    restore: async () => {
      calls.restores += 1;
      return command();
    },
    verify: async () => {
      calls.verifies += 1;
      return command(verifications[verificationIndex]?.passed ? 0 : 1);
    },
    readVerification: () => verifications[verificationIndex++]!,
    copyFile: (source, destination) => calls.copies.push(`${source}->${destination}`),
    reportVerification: (_file, phase, level) => reports.push({ phase, level }),
  };
  return { dependency, calls, reports };
}

function config(maxAttempts = 5) {
  return {
    sample: "sample-a",
    maxAttempts,
    outputDirectory: "/output",
    verificationRoot: "/verification",
    repairContext: "/repo/.sync/verify-latest.json",
  };
}

test("defaults to five total attempts", () => {
  assert.equal(DEFAULT_MAX_ATTEMPTS, 5);
});

test("passes on the first attempt", async () => {
  const { dependency, calls } = dependencies([
    { passed: true, outputDigest: "digest-1", errors: [] },
  ]);

  const result = await runAgentValidationLoop(config(), dependency);

  assert.equal(result.success, true);
  assert.equal(result.attemptsUsed, 1);
  assert.equal(result.terminalReason, "passed");
  assert.equal(calls.agents, 1);
  assert.match(calls.copies[0]!, /sample-a-first\.json$/);
});

test("retries verification failures until a later attempt passes", async () => {
  const { dependency, calls, reports } = dependencies([
    { passed: false, outputDigest: "digest-1", errors: ["missing manifest"] },
    { passed: false, outputDigest: "digest-2", errors: ["requires schema 1.29"] },
    { passed: true, outputDigest: "digest-3", errors: [] },
  ]);

  const result = await runAgentValidationLoop(config(), dependency);

  assert.equal(result.success, true);
  assert.equal(result.attemptsUsed, 3);
  assert.equal(calls.agents, 3);
  assert.deepEqual(reports, [
    { phase: "initial", level: "warning" },
    { phase: "repair-1", level: "warning" },
  ]);
  assert.equal(calls.copies.filter((item) => item.endsWith("verify-latest.json")).length, 2);
});

test("stops at the configured attempt limit", async () => {
  const { dependency, calls, reports } = dependencies([
    { passed: false, outputDigest: "digest-1", errors: ["error-1"] },
    { passed: false, outputDigest: "digest-2", errors: ["error-2"] },
  ]);

  const result = await runAgentValidationLoop(config(2), dependency);

  assert.equal(result.success, false);
  assert.equal(result.attemptsUsed, 2);
  assert.equal(result.terminalReason, "attempt-limit");
  assert.equal(calls.agents, 2);
  assert.deepEqual(reports.at(-1), { phase: "repair-1", level: "error" });
});

test("stops early when verification makes no progress", async () => {
  const { dependency, calls } = dependencies([
    { passed: false, outputDigest: "same", errors: ["same error"] },
    { passed: false, outputDigest: "same", errors: ["same error"] },
  ]);

  const result = await runAgentValidationLoop(config(), dependency);

  assert.equal(result.success, false);
  assert.equal(result.terminalReason, "no-progress");
  assert.equal(calls.agents, 2);
});

test("does not retry a failed write-boundary check", async () => {
  const { dependency, calls } = dependencies([
    { passed: false, outputDigest: "unused", errors: ["unused"] },
  ]);
  dependency.guard = async () => {
    calls.guards += 1;
    return command(2);
  };

  const result = await runAgentValidationLoop(config(), dependency);

  assert.equal(result.success, false);
  assert.equal(result.terminalReason, "guard-failed");
  assert.equal(calls.agents, 1);
  assert.equal(calls.verifies, 0);
});

test("repair prompt keeps proposed decisions out of the repair authority", () => {
  const prompt = buildAgentPrompt("sample-a", 2, 5);

  assert.match(prompt, /VERIFICATION_FILE=\.sync\/context\/verify-latest\.json/);
  assert.match(prompt, /repair attempt 2 of 5/);
  assert.match(prompt, /proposed decision is not approval/i);
});

test("derives the restore path from trusted agent input", () => {
  const root = mkdtempSync(path.join(tmpdir(), "teams-sync-loop-"));
  const input = path.join(root, "agent-input.json");
  writeFileSync(
    input,
    JSON.stringify({
      sampleName: "sample-a",
      repository: { destinationRoot: "samples/dotnet/teams" },
      sample: { destination: "samples/dotnet/teams/folder-a" },
    }),
    "utf8",
  );

  assert.equal(
    sampleRootFromAgentInput(root, "sample-a", input),
    path.join(root, "samples", "dotnet", "teams", "folder-a"),
  );
});

test("rejects an agent input destination outside the configured root", () => {
  const root = mkdtempSync(path.join(tmpdir(), "teams-sync-loop-"));
  const input = path.join(root, "agent-input.json");
  writeFileSync(
    input,
    JSON.stringify({
      sampleName: "sample-a",
      repository: { destinationRoot: "samples/dotnet/teams" },
      sample: { destination: "../../escape" },
    }),
    "utf8",
  );

  assert.throws(() => sampleRootFromAgentInput(root, "sample-a", input), /escapes/);
});

test("detects changes to protected agent context", () => {
  const root = mkdtempSync(path.join(tmpdir(), "teams-sync-loop-context-"));
  const contextRoot = path.join(root, "context");
  const input = path.join(contextRoot, "agent-input.json");
  mkdirSync(contextRoot);
  writeFileSync(input, "trusted", "utf8");
  const context = new ProtectedContext(input);

  context.assertUnchanged();
  chmodSync(contextRoot, 0o700);
  chmodSync(input, 0o600);
  writeFileSync(input, "changed", "utf8");

  assert.throws(() => context.assertUnchanged(), /changed protected synchronization context/);
});
