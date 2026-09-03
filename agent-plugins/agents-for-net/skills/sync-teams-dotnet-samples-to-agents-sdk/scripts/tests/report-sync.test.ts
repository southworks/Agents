import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  escapeWorkflowCommand,
  reportVerification,
  unresolvedReason,
} from "../report-sync.js";

test("escapes GitHub workflow command content", () => {
  assert.equal(escapeWorkflowCommand("line 1%\nline 2"), "line 1%25%0Aline 2");
  assert.equal(escapeWorkflowCommand("sample: phase, repair", true), "sample%3A phase%2C repair");
});

test("reports each verification error with sample and phase", () => {
  const root = mkdtempSync(path.join(tmpdir(), "teams-sync-report-"));
  const verification = path.join(root, "verify.json");
  writeFileSync(
    verification,
    JSON.stringify({ sample: "sample-a", errors: ["Missing appManifest/manifest.json"] }),
    "utf8",
  );

  assert.deepEqual(
    reportVerification({ verification, phase: "initial", level: "warning" }),
    [
      "::warning title=Teams sample sync%3A sample-a (initial)::Missing appManifest/manifest.json",
    ],
  );
});

test("uses the migration loop result as the unresolved reason", () => {
  const root = mkdtempSync(path.join(tmpdir(), "teams-sync-unresolved-"));
  const loop = path.join(root, "agent-loop.json");
  const second = path.join(root, "second.json");
  writeFileSync(
    loop,
    JSON.stringify({ attemptsUsed: 3, maxAttempts: 5, message: "schema error" }),
    "utf8",
  );

  assert.equal(
    unresolvedReason({
      sample: "sample-a",
      setupOutcome: "success",
      migrationLoopOutcome: "failure",
      migrationLoopSuccess: "false",
      migrationLoopResult: loop,
      proposalModeOutcome: "skipped",
      proposalModeValue: "",
      checkpointOutcome: "skipped",
      tentativeOutcome: "skipped",
      tentativeGuardOutcome: "skipped",
      candidateOutcome: "skipped",
      contractOutcome: "skipped",
      reconcileOutcome: "skipped",
      reconcileGuardOutcome: "skipped",
      secondOutcome: "skipped",
      proposalOutcome: "skipped",
      finalizeOutcome: "skipped",
      patchOutcome: "skipped",
      uploadOutcome: "success",
      candidateVerification: path.join(root, "candidate.json"),
      secondVerification: second,
      artifact: "teams-sample-sync-sample-a",
    }),
    "Migration loop failed after 3/5 attempts: schema error",
  );
});
