import assert from "node:assert/strict";
import { test } from "node:test";
import { failureReport, workflowSummary } from "../../src/report.js";
import type { SyncResult } from "../../src/types.js";

function result(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    version: 4,
    sample: "bot-message-extensions",
    status: "failed",
    publishable: false,
    baseSha: "base",
    previousUpstreamCommit: null,
    upstreamCommit: "upstream",
    upstreamChanges: [],
    changedComponents: [],
    copilot: { sdkVersion: "1.0.13", runtimeVersion: "1.0.83" },
    observedModels: [],
    sourceTree: "tree",
    sourceContextDigest: "context",
    inputDigest: "input",
    componentDigests: {},
    diagnostics: [],
    ...overrides,
  };
}

test("renders a failed synchronization for stderr and GitHub annotations", () => {
  const report = failureReport(result({
    sample: "bot:message,extensions",
    error: "Only released Teams manifest schema URLs are supported\n100% checked",
    observedModels: [{ model: "claude-sonnet-4.5", reasoningEffort: "unknown" }],
  }));

  assert.deepEqual(report, {
    stderr: "Sample synchronization failed (bot:message,extensions): Only released Teams manifest schema URLs are supported\n100% checked",
    annotation: "::error title=bot%3Amessage%2Cextensions synchronization failed::Only released Teams manifest schema URLs are supported%0A100%25 checked%0ACopilot model: claude-sonnet-4.5",
  });
});

test("falls back to diagnostics when a failed result has no primary error", () => {
  assert.deepEqual(failureReport(result({ diagnostics: ["Validation failed"] })), {
    stderr: "Sample synchronization failed (bot-message-extensions): Validation failed",
    annotation: "::error title=bot-message-extensions synchronization failed::Validation failed%0ACopilot model: not observed",
  });
});

test("does not render a failure report for a publishable result", () => {
  assert.equal(failureReport(result({ status: "updated", publishable: true })), undefined);
});

test("workflow summary identifies the uploaded diagnostic artifact", () => {
  const summary = workflowSummary(result({ observedModels: [{ model: "claude-sonnet-4.5", reasoningEffort: "unknown" }] }));
  assert.match(summary, /Copilot model: `claude-sonnet-4.5`/);
  assert.match(summary, /Diagnostic artifact: `teams-sample-sync-bot-message-extensions`/);
});
