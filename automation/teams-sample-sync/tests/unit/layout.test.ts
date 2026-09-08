import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import YAML from "yaml";
import { targets } from "../../src/config.js";

test("workflow actions and public skills resolve in the relocated repository layout", () => {
  const repo = fileURLToPath(new URL("../../../../", import.meta.url));
  const workflow = YAML.parse(readFileSync(path.join(repo, ".github/workflows/sync-teams-dotnet-samples.yml"), "utf8"));
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(Object.keys(workflow.jobs), ["plan", "migrate", "publish"]);
  assert.equal(workflow.jobs.migrate.permissions.contents, "read");
  assert.equal(workflow.jobs.publish.permissions["copilot-requests"], undefined);
  for (const job of Object.values(workflow.jobs) as Array<{ steps: Array<{ uses?: string }> }>) {
    for (const step of job.steps.filter((step) => step.uses?.startsWith("./"))) {
      const relative = step.uses!.slice(2) + "/action.yml";
      const action = YAML.parse(readFileSync(path.join(repo, relative), "utf8"));
      assert.equal(action.runs.using, "composite");
      assert.equal(spawnSync("git", ["check-ignore", "--no-index", relative], { cwd: repo }).status, 1,
        `Action must be included in a clean checkout: ${relative}`);
    }
  }
  const configured = targets(repo);
  for (const skill of [configured.migrationSkill, configured.manifestSkill]) {
    assert.ok(skill.startsWith("agent-plugins/"));
    assert.ok(existsSync(path.join(repo, skill, "SKILL.md")));
  }
});
