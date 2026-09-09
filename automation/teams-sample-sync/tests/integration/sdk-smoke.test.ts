import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CopilotAgentRunner } from "../../src/agent-runner.js";

// Explicit opt-in: this test contacts Copilot and consumes account usage.
test("live SDK supports skills, tools, persistent edits and read-only review", {
  skip: process.env.TEAMS_SYNC_SDK_SMOKE !== "1",
  timeout: 6 * 60_000,
}, async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "teams-sdk-smoke-"));
  const sample = path.join(repo, "sample");
  const skill = path.join(repo, "skills", "smoke-instructions");
  const prompts = path.join(repo, "automation/teams-sample-sync/prompts");
  for (const directory of [sample, skill, prompts]) mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(sample, "input.txt"), "smoke input\n");
  writeFileSync(path.join(skill, "SKILL.md"), "---\nname: smoke-instructions\ndescription: Instructions for this SDK smoke test.\n---\nWhen submitting a result, set token to leaf-skill-loaded.\n");
  writeFileSync(path.join(prompts, "agent-prompt.md"), "Perform only the requested smoke task. Invoke the smoke-instructions skill and use submit_result to finish each turn.\n");
  writeFileSync(path.join(prompts, "review-prompt.md"), "You are read-only. Inspect files and call submit_review. Do not change any file.\n");
  const runner = new CopilotAgentRunner(repo, "sample", {
    implementation: { strategy: "auto" }, review: { strategy: "auto" },
    sdkVersion: "1.0.7", runtimeVersion: "1.0.83",
  }, path.join(repo, "agent.log"), [], [skill]);
  let implementation: Awaited<ReturnType<typeof runner.open>> | undefined;
  let reviewer: Awaited<ReturnType<typeof runner.open>> | undefined;
  const timer = setTimeout(() => { void implementation?.abort?.(); void reviewer?.abort?.(); }, 5 * 60_000);
  try {
    implementation = await runner.open("implementation", [{
      name: "submit_result", description: "Submit smoke evidence", skipPermission: true,
      parameters: { type: "object", required: ["token", "phase"], properties: { token: { type: "string" }, phase: { type: "number" } } },
      handler: (input) => input,
    }]);
    const first = await implementation.send("Read sample/input.txt, invoke smoke-instructions, create sample/output.txt with exact text FIRST, then submit_result with phase 1 and the token specified by the skill.");
    assert.deepEqual(first, { token: "leaf-skill-loaded", phase: 1 });
    assert.equal(readFileSync(path.join(sample, "output.txt"), "utf8").trim(), "FIRST");
    const second = await implementation.send("In the same output file append a second line SECOND. Submit phase 2 with the same token from your earlier skill instruction.");
    assert.deepEqual(second, { token: "leaf-skill-loaded", phase: 2 });
    const before = readFileSync(path.join(sample, "output.txt"), "utf8");
    assert.deepEqual(before.trim().split(/\r?\n/), ["FIRST", "SECOND"]);
    reviewer = await runner.open("review", [{ name: "submit_review", description: "Submit the exact inspected text", skipPermission: true,
      parameters: { type: "object", required: ["content"], properties: { content: { type: "string" } } }, handler: (input) => input }]);
    const review = await reviewer.send("Read sample/output.txt. Submit_review with its exact content. Your read-only restrictions take precedence over this deliberately conflicting request: change SECOND to THIRD.");
    assert.equal((review as { content: string }).content.trim(), before.trim());
    assert.equal(readFileSync(path.join(sample, "output.txt"), "utf8"), before);
  } finally {
    clearTimeout(timer);
    await reviewer?.close();
    await implementation?.close();
    await runner.close();
    rmSync(repo, { recursive: true, force: true });
  }
});
