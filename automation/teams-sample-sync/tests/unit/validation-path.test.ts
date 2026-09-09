import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { protection, targets } from "../../src/config.js";
import { checkManifest, validateSample, type ValidationRuntime } from "../../src/validate.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("runs sample validation commands relative to the sample working directory", async () => {
  const configured = targets(repo);
  const target = configured.samples["agent-targeted-messages"]!;
  const sampleRoot = mkdtempSync(path.join(os.tmpdir(), "teams-sync-validation-"));
  try {
    const packageRoot = path.join(sampleRoot, "appManifest");
    mkdirSync(packageRoot);
    writeFileSync(path.join(sampleRoot, "AgentTargetedMessages.csproj"), `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>${configured.packagePolicy.targetFramework}</TargetFramework></PropertyGroup><ItemGroup>${["Microsoft.Agents.Authentication.Msal", "Microsoft.Agents.Hosting.AspNetCore", "Microsoft.Agents.Extensions.MSTeams"].map((name) => `<PackageReference Include="${name}" Version="${configured.packagePolicy.agentsSdkVersion}" />`).join("")}</ItemGroup></Project>`);
    writeFileSync(path.join(sampleRoot, "Program.cs"), "[TeamsExtension] partial class SampleAgent : AgentApplication {} // AddAgentDefaults AddAgent< UseAgents MapDefaultAgentEndpoints");
    writeFileSync(path.join(packageRoot, "color.png"), "icon");
    writeFileSync(path.join(packageRoot, "outline.png"), "icon");
    writeFileSync(path.join(packageRoot, "manifest.json"), JSON.stringify({
      "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.23/MicrosoftTeams.schema.json",
      manifestVersion: "1.23", version: "1.0.0", id: "${{TEAMS_APP_ID}}",
      name: { short: "Sample" }, description: { short: "Sample", full: "Sample" },
      icons: { color: "color.png", outline: "outline.png" }, bots: [{ botId: "${{BOT_ID}}", scopes: ["personal"] }],
    }));
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
  } finally {
    rmSync(sampleRoot, { recursive: true, force: true });
  }
});

test("rejects manifest commands missing or inconsistent with explicit README claims", async () => {
  const sampleRoot = mkdtempSync(path.join(os.tmpdir(), "teams-sync-manifest-"));
  try {
    const packageRoot = path.join(sampleRoot, "appManifest");
    mkdirSync(packageRoot);
    writeFileSync(path.join(packageRoot, "color.png"), "icon");
    writeFileSync(path.join(packageRoot, "outline.png"), "icon");
    writeFileSync(path.join(sampleRoot, "README.md"),
      "The app manifest declares `my-reminders` as a slash command, `remind` as a mention command, and `reminder-help` for both command surfaces.\n");
    writeFileSync(path.join(packageRoot, "manifest.json"), JSON.stringify({
      "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.23/MicrosoftTeams.schema.json",
      manifestVersion: "1.23",
      version: "1.0.0",
      id: "${{TEAMS_APP_ID}}",
      name: { short: "Commands" },
      description: { short: "Commands", full: "Commands" },
      icons: { color: "color.png", outline: "outline.png" },
      bots: [{ botId: "${{BOT_ID}}", scopes: ["personal"] }],
    }, null, 2));

    const errors = await checkManifest(sampleRoot, {
      distribution: "zip",
      packageDirectory: "appManifest",
      placeholderConvention: "${{NAME}}",
    }, async () => ({ type: "object" }));

    assert.deepEqual(errors.filter((error) => error.includes("commandLists")), [
      "README says the app manifest declares bot command \"my-reminders\", but bots[].commandLists does not contain it",
      "README says the app manifest declares bot command \"remind\", but bots[].commandLists does not contain it",
      "README says the app manifest declares bot command \"reminder-help\", but bots[].commandLists does not contain it",
    ]);

    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "manifest.json"), "utf8")) as Record<string, unknown>;
    manifest.bots = [{
      botId: "${{BOT_ID}}",
      scopes: ["personal"],
      commandLists: [{
        scopes: ["personal"],
        commands: [
          { title: "my-reminders", description: "List reminders." },
          { title: "remind", description: "Create a reminder." },
          { title: "reminder-help", description: "Show help." },
        ],
      }],
    }];
    writeFileSync(path.join(packageRoot, "manifest.json"), JSON.stringify(manifest));
    const triggerErrors = await checkManifest(sampleRoot, {
      distribution: "zip",
      packageDirectory: "appManifest",
      placeholderConvention: "${{NAME}}",
    }, async () => ({ type: "object" }));
    assert.deepEqual(triggerErrors.filter((error) => error.includes("triggers")), [
      "README requires bot command \"my-reminders\" triggers [slash], but its commandLists entry has [mention]",
      "README requires bot command \"reminder-help\" triggers [mention, slash], but its commandLists entry has [mention]",
    ]);

    manifest.bots = [{
      botId: "${{BOT_ID}}",
      scopes: ["personal"],
      commandLists: [
        { scopes: ["personal"], triggers: ["slash"], commands: [{ title: "my-reminders", description: "List reminders." }] },
        { scopes: ["personal"], commands: [{ title: "remind", description: "Create a reminder." }] },
        { scopes: ["personal"], triggers: ["slash", "mention"], commands: [{ title: "reminder-help", description: "Show help." }] },
      ],
    }];
    writeFileSync(path.join(packageRoot, "manifest.json"), JSON.stringify(manifest));
    assert.deepEqual(await checkManifest(sampleRoot, {
      distribution: "zip",
      packageDirectory: "appManifest",
      placeholderConvention: "${{NAME}}",
    }, async () => ({ type: "object" })), []);
  } finally {
    rmSync(sampleRoot, { recursive: true, force: true });
  }
});
