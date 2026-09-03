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

test("uses the repaired verification error as the unresolved reason", () => {
  const root = mkdtempSync(path.join(tmpdir(), "teams-sync-unresolved-"));
  const first = path.join(root, "first.json");
  const repair = path.join(root, "repair.json");
  const second = path.join(root, "second.json");
  writeFileSync(first, JSON.stringify({ errors: ["first error"] }), "utf8");
  writeFileSync(repair, JSON.stringify({ errors: ["repair error"] }), "utf8");

  assert.equal(
    unresolvedReason({
      sample: "sample-a",
      setupOutcome: "success",
      firstAgentOutcome: "success",
      firstGuardOutcome: "success",
      restoreOutcome: "success",
      firstVerificationOutcome: "failure",
      firstSuccess: "false",
      repairContextOutcome: "success",
      repairAgentOutcome: "success",
      repairGuardOutcome: "success",
      repairRestoreOutcome: "success",
      repairVerificationOutcome: "failure",
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
      firstVerification: first,
      repairVerification: repair,
      candidateVerification: path.join(root, "candidate.json"),
      secondVerification: second,
      artifact: "teams-sample-sync-sample-a",
    }),
    "Verification remained unresolved after the bounded repair: repair error",
  );
});
