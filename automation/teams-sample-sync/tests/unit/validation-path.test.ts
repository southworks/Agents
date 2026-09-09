import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { protection, targets } from "../../src/config.js";
import { validateSample, type ValidationRuntime } from "../../src/validate.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("runs sample validation commands relative to the sample working directory", async () => {
  const configured = targets(repo);
  const target = configured.samples["agent-targeted-messages"]!;
  const sampleRoot = path.join(repo, configured.destinationRoot, target.destination);
  const commands: Array<{ args: string[]; cwd: string }> = [];
  let smokeProject = "";
  const runtime: ValidationRuntime = {
    runCommand: async (_command, args, cwd) => { commands.push({ args, cwd }); return []; },
    runHttpSmoke: async (_root, project) => { smokeProject = project; return []; },
    loadSchema: async () => ({ type: "object" }),
  };

  const validation = await validateSample(repo, "agent-targeted-messages", sampleRoot, configured, target.manifest, protection(repo).outputDigestExcludes, runtime);

  assert.equal(validation.passed, true);
  assert.deepEqual(commands[0], { args: ["restore", "AgentTargetedMessages.csproj", "--nologo"], cwd: sampleRoot });
  assert.deepEqual(commands[1], { args: ["build", "AgentTargetedMessages.csproj", "--no-restore", "--nologo", "--warnaserror"], cwd: sampleRoot });
  assert.equal(smokeProject, "AgentTargetedMessages.csproj");
});
