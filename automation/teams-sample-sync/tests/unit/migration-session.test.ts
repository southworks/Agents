import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertOutcomeMatchesSampleChanges, runMigrationSession } from "../../src/sync-session.js";
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
  const session = new FakeSession(["## Migration plan\n- Program.Main", "## Self-audit\nOutcome: changed\n- Program.Main done", "## Self-audit\nOutcome: changed\n- Program.Main fixed"]);
  const results = [validation(false, "first"), validation(true, "second")];
  try {
    const result = await runMigrationSession({ sample: "sample-a", contextFile: ".sync/context/sync-context.json", output, session, validate: async () => results.shift()! });
    assert.equal(result.repairPasses, 1);
    assert.equal(session.writable, true);
    assert.equal(session.prompts.length, 3);
    assert.match(session.prompts[0]!, /actual manifest JSON[\s\S]*bots\[\]\.commandLists/);
    assert.match(session.prompts[1]!, /frozen migration plan/);
    assert.match(session.prompts[1]!, /schema validity alone is insufficient/);
    assert.match(session.prompts[2]!, /Build failed/);
    assert.match(session.prompts[2]!, /do not explain away a semantic mismatch/);
    assert.equal(readFileSync(path.join(output, "migration-plan.md"), "utf8"), "## Migration plan\n- Program.Main\n");
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("requires a self-audit after a successful implementation", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "teams-sync-session-"));
  let validationRan = false;
  try {
    await assert.rejects(
      runMigrationSession({ sample: "sample-a", contextFile: ".sync/context/sync-context.json", output, session: new FakeSession(["## Migration plan", "I'll begin the implementation now."]), validate: async () => { validationRan = true; return validation(true, "ready"); } }),
      /missing required heading "## Self-audit"; the next full validation pass was not run\. Response ended with: "I'll begin the implementation now\."/,
    );
    assert.equal(validationRan, false);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("explains a missing self-audit outcome and previews the end of the response", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "teams-sync-session-"));
  const response = `## Self-audit\n${"Earlier audit detail. ".repeat(30)}\nThe destination sample was already fully implemented.`;
  try {
    await assert.rejects(
      runMigrationSession({ sample: "sample-a", contextFile: ".sync/context/sync-context.json", output, session: new FakeSession(["## Migration plan", response]), validate: async () => validation(true, "ready") }),
      (error: Error) => {
        assert.match(error.message, /missing required line "Outcome: changed" or "Outcome: no changes required"; the next full validation pass was not run\./);
        assert.match(error.message, /Response ended with: "….*The destination sample was already fully implemented\."/);
        assert.ok(error.message.length < response.length);
        return true;
      },
    );
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("accurately reports a malformed self-audit after a failed validation pass", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "teams-sync-session-"));
  let validationRuns = 0;
  try {
    await assert.rejects(
      runMigrationSession({
        sample: "sample-a",
        contextFile: ".sync/context/sync-context.json",
        output,
        session: new FakeSession(["## Migration plan", "## Self-audit\nOutcome: changed", "Repair finished."]),
        validate: async () => { validationRuns += 1; return validation(false, "failed"); },
      }),
      /missing required heading "## Self-audit"; the next full validation pass was not run\. Response ended with: "Repair finished\."/,
    );
    assert.equal(validationRuns, 1);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("rejects progress-only plans and contradictory outcomes", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "teams-sync-session-"));
  try {
    await assert.rejects(
      runMigrationSession({ sample: "sample-a", contextFile: ".sync/context/sync-context.json", output, session: new FakeSession(["I'll begin by inspecting the sample."]), validate: async () => validation(true, "ready") }),
      /complete Markdown migration plan/,
    );
    assert.throws(() => assertOutcomeMatchesSampleChanges("changed", []), /selected sample is unchanged/);
    assert.throws(() => assertOutcomeMatchesSampleChanges("no-changes", ["samples/dotnet/teams/sample/Program.cs"]), /selected sample was modified/);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
