import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { PermissionRequest, SessionConfig } from "@github/copilot-sdk";
import { CopilotAgentRunner, permissionFor, type SdkClient, type SdkSession } from "../../src/agent-runner.js";

const writeRequest = (fileName: string): PermissionRequest => ({ kind: "write", fileName, intention: "test", diff: "", canOfferSessionApproval: false });

test("SDK write permissions permit nested sample files but deny escapes and reviewer writes", () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "sync-permissions-"));
  try {
    mkdirSync(path.join(repo, "sample"));
    writeFileSync(path.join(repo, "sample", "file.cs"), "source");
    assert.equal(permissionFor(repo, "sample", false, writeRequest("sample/new/deep/file.cs")).kind, "approve-once");
    assert.equal(permissionFor(repo, "sample", false, writeRequest("sample/../../escape.cs")).kind, "reject");
    assert.equal(permissionFor(repo, "sample", true, writeRequest("sample/file.cs")).kind, "reject");
    assert.equal(permissionFor(repo, "sample", false, { kind: "read", path: "sample/file.cs", intention: "inspect" }).kind, "approve-once");
    assert.equal(permissionFor(repo, "sample", false, { kind: "read", path: os.homedir(), intention: "inspect" }).kind, "reject");
    assert.equal(permissionFor(repo, "sample", false, { kind: "url", url: "https://learn.microsoft.com/en-us/microsoftteams/", intention: "docs" }).kind, "approve-once");
    assert.equal(permissionFor(repo, "sample", false, { kind: "url", url: "https://example.com", intention: "docs" }).kind, "reject");
    assert.equal(permissionFor(repo, "sample", true, { kind: "custom-tool", toolName: "validate_sample", toolDescription: "runs code" }).kind, "reject");
    mkdirSync(path.join(repo, "outside"));
    symlinkSync(path.join(repo, "outside"), path.join(repo, "sample", "link"), process.platform === "win32" ? "junction" : "dir");
    assert.equal(permissionFor(repo, "sample", false, writeRequest("sample/link/new/file.cs")).kind, "reject");
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("persistent adapter waits for tool submission and retains only accepted results", async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "sync-adapter-"));
  let config: SessionConfig | undefined;
  let waitCalls = 0;
  let aborted = 0;
  let disconnected = 0;
  let stopped = 0;
  const session: SdkSession = {
    on: (() => () => {}) as SdkSession["on"],
    sendAndWait: async () => {
      waitCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      const tool = config?.tools?.find((entry) => entry.name === "submit_result");
      assert.ok(tool?.handler);
      await tool.handler({ raw: waitCalls }, { sessionId: "test", toolCallId: "call", toolName: tool.name, arguments: {} });
      return undefined;
    },
    abort: async () => { aborted += 1; },
    disconnect: async () => { disconnected += 1; },
  };
  const client: SdkClient = {
    start: async () => {}, stop: async () => { stopped += 1; return []; }, listModels: async () => [],
    getStatus: async () => ({ version: "1.0.83", protocolVersion: 1 }),
    getAuthStatus: async () => ({ isAuthenticated: true }),
    createSession: async (value) => { config = value; return session; },
  };
  try {
    const prompts = path.join(repo, "automation/teams-sample-sync/prompts");
    mkdirSync(prompts, { recursive: true });
    writeFileSync(path.join(prompts, "agent-prompt.md"), "Migrate");
    const runner = new CopilotAgentRunner(repo, "sample", { implementation: { strategy: "auto" }, review: { strategy: "auto" }, sdkVersion: "1.0.7", runtimeVersion: "1.0.83" }, path.join(repo, "log"), [], [], async () => client);
    let reject = false;
    const active = await runner.open("implementation", [{ name: "submit_result", handler: () => {
      if (reject) throw new Error("invalid report");
      return { accepted: true };
    } }]);
    assert.ok(Array.isArray(config?.availableTools) && config.availableTools.includes("skill"));
    const denied = await config?.hooks?.onPreToolUse?.({ toolName: "shell", toolArgs: {}, sessionId: "test", timestamp: new Date(), workingDirectory: repo }, { sessionId: "test" });
    assert.equal(denied?.permissionDecision, "deny");
    assert.deepEqual(await active.send("first"), { accepted: true });
    reject = true;
    await assert.rejects(active.send("second"), /invalid report/);
    await active.abort?.();
    await active.close();
    await runner.close();
    assert.deepEqual({ waitCalls, aborted, disconnected, stopped }, { waitCalls: 2, aborted: 1, disconnected: 1, stopped: 1 });
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
