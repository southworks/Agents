import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runMigrationSession } from "../../src/sync-session.js";
import type { ImplementationSession } from "../../src/agent-runner.js";
import type { ValidationResult } from "../../src/types.js";

function validation(passed: boolean, digest: string): ValidationResult {
  return { version: 2, id: digest, sample: "sample-a", group: "all", passed, repairable: true, outputDigest: digest, errors: passed ? [] : ["Build failed"], externalValidationRequired: [], checks: { project: { status: "passed", errors: [] }, restore: { status: "passed", errors: [] }, build: { status: passed ? "passed" : "failed", errors: passed ? [] : ["Build failed"] }, manifest: { status: "passed", errors: [] }, httpSmoke: { status: "passed", errors: [] }, contracts: { status: "passed", errors: [] }, sampleTests: { status: "skipped", errors: [] } } };
}

class FakeSession implements ImplementationSession {
  writable = false; readonly prompts: string[] = [];
  constructor(private readonly answers: string[]) {}
  setWriteAccess(enabled: boolean): void { this.writable = enabled; }
  async send(message: string): Promise<string> { this.prompts.push(message); return this.answers.shift() ?? ""; }
  async close(): Promise<void> {}
  async abort(): Promise<void> {}
}

test("freezes the plan before implementation and repairs validation once", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "teams-sync-session-"));
  const session = new FakeSession(["# Plan\n- Program.Main", "# Audit\n- Program.Main done", "# Repair audit\n- Program.Main fixed"]);
  const results = [validation(false, "first"), validation(true, "second")];
  try {
    const result = await runMigrationSession({ sample: "sample-a", contextFile: ".sync/context/sync-context.json", output, session, validate: async () => results.shift()! });
    assert.equal(result.repairPasses, 1);
    assert.equal(session.writable, true);
    assert.equal(session.prompts.length, 3);
    assert.match(session.prompts[1]!, /frozen migration plan/);
    assert.match(session.prompts[2]!, /Build failed/);
    assert.equal(readFileSync(path.join(output, "migration-plan.md"), "utf8"), "# Plan\n- Program.Main\n");
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("requires a self-audit after a successful implementation", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "teams-sync-session-"));
  try {
    await assert.rejects(
      runMigrationSession({ sample: "sample-a", contextFile: ".sync/context/sync-context.json", output, session: new FakeSession(["# Plan", ""]), validate: async () => validation(true, "ready") }),
      /self-audit/,
    );
  } finally { rmSync(output, { recursive: true, force: true }); }
});
