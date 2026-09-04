import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { targets } from "../src/config.js";
import { checkManifest, checkProject, prepareManifest, validateSample, type ValidationRuntime } from "../src/validate.js";
import { fixture, write } from "./helpers.js";

function validProject(root: string): void {
  write(path.join(root, "Sample.csproj"), `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Agents.Authentication.Msal" Version="1.7.*" />
    <PackageReference Include="Microsoft.Agents.Extensions.MSTeams" Version="1.7.*" />
    <PackageReference Include="Microsoft.Agents.Hosting.AspNetCore" Version="1.7.*" />
  </ItemGroup>
</Project>`);
  write(path.join(root, "SampleAgent.cs"), "[TeamsExtension] public partial class SampleAgent : AgentApplication { }");
  write(path.join(root, "Program.cs"), "builder.AddAgentDefaults().AddAgent<SampleAgent>(); app.UseAgents(); app.MapDefaultAgentEndpoints();");
}

test("project validation enforces Agents host and rejects Teams bootstrap", () => {
  const item = fixture();
  const root = path.join(item.repo, "samples/dotnet/teams/sample-a");
  validProject(root);
  assert.deepEqual(checkProject(root, targets(item.repo)).errors, []);
  write(path.join(root, "Program.cs"), `${readFileSync(path.join(root, "Program.cs"), "utf8")} builder.AddTeams();`);
  assert.match(checkProject(root, targets(item.repo)).errors.join("\n"), /Teams SDK bootstrap/);
  write(path.join(root, "Sample.csproj"), readFileSync(path.join(root, "Sample.csproj"), "utf8")
    .replace("</ItemGroup>", "<PackageReference Include=\"Microsoft.Bot.Builder\" Version=\"4.0.0\" /></ItemGroup>"));
  assert.match(checkProject(root, targets(item.repo)).errors.join("\n"), /Legacy Teams or Bot SDK packages/);
  write(path.join(root, "manifest-evidence.md"), "not allowed");
  assert.match(checkProject(root, targets(item.repo)).errors.join("\n"), /manifest-evidence/);
});

test("manifest validation uses released schema, package assets, and source capabilities", async () => {
  const item = fixture();
  const root = path.join(item.repo, "samples/dotnet/teams/sample-a");
  validProject(root);
  prepareManifest(root, path.join(item.repo, "samples/dotnet/quickstart"), targets(item.repo).samples["sample-a"]!.manifest);
  const packageRoot = path.join(root, "appManifest");
  write(path.join(packageRoot, "manifest.json"), JSON.stringify({
    $schema: "https://developer.microsoft.com/json-schemas/teams/v1.22/MicrosoftTeams.schema.json",
    manifestVersion: "1.22", version: "1.0.0", id: "${{CLIENT_ID}}",
    name: { short: "Sample" }, description: { short: "Sample", full: "Sample" },
    icons: { color: "color.png", outline: "outline.png" }, bots: [{ botId: "${{CLIENT_ID}}", scopes: ["personal"] }],
  }, null, 2));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ type: "object" }), { status: 200 }));
  try {
    assert.deepEqual(await checkManifest(root, targets(item.repo).samples["sample-a"]!.manifest), []);
    write(path.join(root, "color.png"), "misplaced");
    assert.match((await checkManifest(root, targets(item.repo).samples["sample-a"]!.manifest)).join("\n"), /outside appManifest/);
  } finally { globalThis.fetch = originalFetch; }
});

test("validation orchestrates restore, build, HTTP smoke, and selected contracts", async () => {
  const item = fixture();
  const configured = targets(item.repo);
  const target = configured.samples["sample-a"]!;
  const root = path.join(item.repo, "samples/dotnet/teams/sample-a");
  validProject(root);
  prepareManifest(root, path.join(item.repo, "samples/dotnet/quickstart"), target.manifest);
  write(path.join(root, "appManifest/manifest.json"), JSON.stringify({
    $schema: "https://developer.microsoft.com/json-schemas/teams/v1.22/MicrosoftTeams.schema.json",
    manifestVersion: "1.22", version: "1.0.0", id: "${{CLIENT_ID}}",
    name: { short: "Sample" }, description: { short: "Sample", full: "Sample" },
    icons: { color: "color.png", outline: "outline.png" }, bots: [{ botId: "${{CLIENT_ID}}", scopes: ["personal"] }],
  }));
  const calls: string[] = [];
  const runtime: ValidationRuntime = {
    runCommand: (_command, args) => { calls.push(args[0]!); return []; },
    runHttpSmoke: () => { calls.push("http"); return Promise.resolve([]); },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ type: "object" }), { status: 200 }));
  try {
    const result = await validateSample(item.repo, "bot-ai-messages", root, configured, target.manifest, [], runtime);
    assert.equal(result.passed, true);
    assert.deepEqual(calls, ["restore", "build", "http", "test"]);
    const startupFailure = await validateSample(item.repo, "sample-a", root, configured, target.manifest, [], {
      ...runtime, runHttpSmoke: () => Promise.resolve(["HTTP smoke process exited before readiness"]),
    });
    assert.equal(startupFailure.passed, false);
    assert.match(startupFailure.errors.join("\n"), /before readiness/);
    await assert.rejects(() => validateSample(item.repo, "sample-a", root, configured, target.manifest, [], {
      ...runtime, runCommand: () => { throw new Error("restore infrastructure failed"); },
    }), /infrastructure failed/);
  } finally { globalThis.fetch = originalFetch; }
});
