import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Ajv, type AnySchema, type ErrorObject } from "ajv";
import { XMLParser } from "fast-xml-parser";
import { parseDocument } from "yaml";
import { digestDirectory } from "./git.js";
import { SyncError } from "./config.js";
import type { ManifestTarget, Targets, ValidationChecks, ValidationResult } from "./types.js";

const REQUIRED_PACKAGES = [
  "Microsoft.Agents.Authentication.Msal",
  "Microsoft.Agents.Hosting.AspNetCore",
  "Microsoft.Agents.Extensions.MSTeams",
] as const;

function allFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const item = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new SyncError(`Symlink is not allowed: ${item}`);
      if (entry.isDirectory()) visit(item);
      else if (entry.isFile()) files.push(item);
    }
  };
  visit(root);
  return files;
}

function valuesByKey(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap((item) => valuesByKey(item, key));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([name, child]) =>
    [...(name === key ? (Array.isArray(child) ? child : [child]) : []), ...valuesByKey(child, key)]);
}

function scalar(value: unknown): string | undefined {
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (value && typeof value === "object" && typeof (value as Record<string, unknown>)["#text"] === "string") {
    return (value as Record<string, unknown>)["#text"] as string;
  }
  return undefined;
}

export function checkProject(sampleRoot: string, configured: Targets): { project?: string; errors: string[] } {
  const errors: string[] = [];
  if (!existsSync(sampleRoot) || !statSync(sampleRoot).isDirectory()) return { errors: ["Selected sample does not exist"] };
  const projects = readdirSync(sampleRoot).filter((name) => name.endsWith(".csproj")).sort();
  if (projects.length !== 1) return { errors: [`Expected one project file, found ${projects.length}`] };
  const project = path.join(sampleRoot, projects[0]!);
  let xml: unknown;
  try { xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" }).parse(readFileSync(project, "utf8")); }
  catch (error) { return { project, errors: [`Invalid project XML: ${error instanceof Error ? error.message : String(error)}`] }; }
  const framework = scalar(valuesByKey(xml, "TargetFramework")[0]);
  if (framework !== configured.packagePolicy.targetFramework) {
    errors.push(`TargetFramework must be ${configured.packagePolicy.targetFramework}, found ${String(framework)}`);
  }
  const packages = new Map<string, string | undefined>();
  for (const item of valuesByKey(xml, "PackageReference")) {
    if (!item || typeof item !== "object") continue;
    const reference = item as Record<string, unknown>;
    const name = scalar(reference.Include);
    if (name) packages.set(name, scalar(reference.Version));
  }
  for (const packageName of REQUIRED_PACKAGES) {
    if (packages.get(packageName) !== configured.packagePolicy.agentsSdkVersion) {
      errors.push(`${packageName} must use ${configured.packagePolicy.agentsSdkVersion}`);
    }
  }
  const legacyPackages = [...packages.keys()].filter((name) =>
    name.startsWith("Microsoft.Bot.") || name.startsWith("Microsoft.TeamsFx"));
  if (legacyPackages.length > 0) errors.push(`Legacy Teams or Bot SDK packages remain: ${legacyPackages.sort().join(", ")}`);
  const sources = allFiles(sampleRoot)
    .filter((file) => file.endsWith(".cs") && !["bin", "obj"].includes(path.relative(sampleRoot, file).split(path.sep)[0]!))
    .map((file) => readFileSync(file, "utf8")).join("\n");
  if (!sources.includes("AgentApplication")) errors.push("Missing AgentApplication implementation");
  if (!/partial\s+class\s+\w+[\s\S]*?:\s*AgentApplication/.test(sources)) errors.push("Missing partial AgentApplication subclass");
  if ((sources.match(/\[TeamsExtension\]/g) ?? []).length !== 1) errors.push("Expected exactly one [TeamsExtension] attribute");
  if (/AddTeams\s*\(|UseTeams\s*\(|Microsoft\.TeamsFx|Microsoft\.Bot\.Builder/.test(sources)) {
    errors.push("Teams SDK bootstrap or package usage remains");
  }
  const programPath = path.join(sampleRoot, "Program.cs");
  if (!existsSync(programPath)) errors.push("Missing Program.cs");
  else {
    const program = readFileSync(programPath, "utf8");
    for (const required of ["AddAgentDefaults", "AddAgent<", "UseAgents", "MapDefaultAgentEndpoints"]) {
      if (!program.includes(required)) errors.push(`Program.cs is missing Agents host call: ${required}`);
    }
  }
  if (allFiles(sampleRoot).some((file) => path.basename(file).toLowerCase() === "manifest-evidence.md")) {
    errors.push("manifest-evidence.md is prohibited");
  }
  return { project, errors };
}

function renderPlaceholders(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(renderPlaceholders);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key, renderPlaceholders(item)]));
  if (typeof value !== "string") return value;
  const replace = (_match: string, raw: string): string => {
    const name = raw.toUpperCase();
    if (name.includes("ID")) return "00000000-0000-4000-8000-000000000000";
    if (name.includes("DOMAIN") || name.includes("HOST")) return "example.com";
    if (name.includes("URL")) return "https://example.com";
    return "placeholder";
  };
  return value.replace(/\$\{\{([^{}]+)\}\}/g, replace).replace(/<<([^<>]+)>>/g, replace);
}

async function fetchSchema(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { headers: { "User-Agent": "teams-sample-sync/2" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 5_000_000) throw new Error("Schema response exceeds 5 MB");
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new SyncError(`Released manifest schema is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  } finally { clearTimeout(timer); }
}

function schemaError(error: ErrorObject): string {
  const location = error.instancePath.replace(/^\//, "").replaceAll("/", ".") || "<root>";
  return `Manifest schema error at ${location}: ${error.message ?? error.keyword}`;
}

export async function checkManifest(sampleRoot: string, manifestTarget: ManifestTarget): Promise<string[]> {
  const errors: string[] = [];
  const packageRoot = path.join(sampleRoot, manifestTarget.packageDirectory);
  const manifestPath = path.join(packageRoot, "manifest.json");
  if (!existsSync(manifestPath)) return [`Missing ${manifestTarget.packageDirectory}/manifest.json`];
  const raw = readFileSync(manifestPath, "utf8");
  const yamlDocument = parseDocument(raw, { uniqueKeys: true });
  const duplicate = yamlDocument.errors.find((error) => error.code === "DUPLICATE_KEY");
  if (duplicate) return [`Invalid manifest JSON: ${duplicate.message}`];
  let manifest: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("root must be an object");
    manifest = value as Record<string, unknown>;
  } catch (error) { return [`Invalid manifest JSON: ${error instanceof Error ? error.message : String(error)}`]; }
  for (const key of ["$schema", "manifestVersion", "version", "id", "name", "description", "icons"]) {
    if (!(key in manifest)) errors.push(`Manifest is missing ${key}`);
  }
  for (const name of ["manifest.json", "color.png", "outline.png"]) {
    if (existsSync(path.join(sampleRoot, name))) errors.push(`Manifest asset is outside ${manifestTarget.packageDirectory}: ${name}`);
  }
  const icons = manifest.icons && typeof manifest.icons === "object" ? manifest.icons as Record<string, unknown> : {};
  for (const name of ["color", "outline"]) {
    const icon = icons[name];
    if (typeof icon !== "string" || path.basename(icon) !== icon || !existsSync(path.join(packageRoot, icon))) {
      errors.push(`Manifest icon is missing or outside package root: ${name}`);
    }
  }
  const sources = allFiles(sampleRoot)
    .filter((file) => file.endsWith(".cs") && !["bin", "obj"].includes(path.relative(sampleRoot, file).split(path.sep)[0]!))
    .map((file) => readFileSync(file, "utf8")).join("\n");
  if (sources.includes("AgentApplication") && (!Array.isArray(manifest.bots) || manifest.bots.length === 0)) {
    errors.push("Manifest bots capability does not match the Agents application source");
  }
  if (/Teams(?:Query|SubmitAction|FetchAction|QueryLink|SelectItem)Route/.test(sources) &&
      (!Array.isArray(manifest.composeExtensions) || manifest.composeExtensions.length === 0)) {
    errors.push("Manifest composeExtensions capability does not match message-extension routes");
  }
  const version = manifest.manifestVersion;
  const schemaUrl = manifest.$schema;
  if (typeof version !== "string" || typeof schemaUrl !== "string") return errors;
  let url: URL;
  try { url = new URL(schemaUrl); }
  catch { errors.push("Manifest $schema is not a valid URL"); return errors; }
  const suffix = `/json-schemas/teams/v${version}/MicrosoftTeams.schema.json`;
  if (url.protocol !== "https:" || url.hostname !== "developer.microsoft.com" || !url.pathname.endsWith(suffix)) {
    errors.push("Manifest $schema does not match manifestVersion on developer.microsoft.com");
    return errors;
  }
  const ajv = new Ajv({ allErrors: true, strict: false, unicodeRegExp: false, validateSchema: false, logger: false });
  const validate = ajv.compile(await fetchSchema(schemaUrl) as AnySchema);
  if (!validate(renderPlaceholders(manifest))) errors.push(...(validate.errors ?? []).slice(0, 10).map(schemaError));
  return errors;
}

function commandErrors(command: string, args: string[], cwd: string): string[] {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new SyncError(`Cannot run ${command}: ${result.error.message}`);
  if (result.status === 0) return [];
  const detail = `${result.stdout}\n${result.stderr}`.trim();
  if (/NU13(?:00|01)|unable to load the service index|name or service not known|temporary failure in name resolution|connection (?:refused|timed out)|TLS handshake|network is unreachable/i.test(detail)) {
    throw new SyncError(`Validation infrastructure failed while running ${command} ${args.join(" ")}:\n${detail}`);
  }
  return [`${command} ${args.join(" ")} failed:\n${detail}`];
}

async function httpSmoke(sampleRoot: string, project: string): Promise<string[]> {
  const port = 41000 + Math.floor(Math.random() * 10000);
  const url = `http://127.0.0.1:${port}`;
  const child = spawn("dotnet", ["run", "--project", project, "--no-build", "--no-restore", "--urls", url], {
    cwd: sampleRoot,
    env: { ...process.env, ASPNETCORE_URLS: url, ASPNETCORE_ENVIRONMENT: "Development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
  try {
    for (let count = 0; count < 40; count += 1) {
      if (child.exitCode !== null) return [`HTTP smoke process exited before readiness:\n${output.trim()}`];
      try {
        const response = await fetch(`${url}/`);
        if (response.status === 200) return [];
      } catch { /* Wait for startup. */ }
      await delay(500);
    }
    return [`HTTP smoke GET / did not return 200:\n${output.trim()}`];
  } finally {
    child.kill();
  }
}

export function prepareManifest(sampleRoot: string, canonicalRoot: string, target: ManifestTarget): void {
  const packageRoot = path.join(sampleRoot, target.packageDirectory);
  mkdirSync(packageRoot, { recursive: true });
  for (const name of ["color.png", "outline.png"]) {
    const destination = path.join(packageRoot, name);
    const source = path.join(canonicalRoot, "appManifest", name);
    if (!existsSync(destination) && existsSync(source)) copyFileSync(source, destination);
  }
}

export interface ValidationRuntime {
  runCommand: (command: string, args: string[], cwd: string) => string[];
  runHttpSmoke: (sampleRoot: string, project: string) => Promise<string[]>;
}

const defaultRuntime: ValidationRuntime = {
  runCommand: commandErrors,
  runHttpSmoke: httpSmoke,
};

export async function validateSample(
  repo: string,
  sample: string,
  sampleRoot: string,
  configured: Targets,
  target: ManifestTarget,
  excludes: string[],
  runtime: ValidationRuntime = defaultRuntime,
): Promise<ValidationResult> {
  const checks: ValidationChecks = { project: false, restore: false, build: false, manifest: false, httpSmoke: false, contracts: false };
  const errors: string[] = [];
  const projectCheck = checkProject(sampleRoot, configured);
  errors.push(...projectCheck.errors);
  checks.project = projectCheck.errors.length === 0;
  if (projectCheck.project) {
    const restore = runtime.runCommand("dotnet", ["restore", projectCheck.project, "--nologo"], sampleRoot);
    errors.push(...restore); checks.restore = restore.length === 0;
    if (checks.restore) {
      const build = runtime.runCommand("dotnet", ["build", projectCheck.project, "--no-restore", "--nologo", "--warnaserror"], sampleRoot);
      errors.push(...build); checks.build = build.length === 0;
    }
  }
  const manifestErrors = await checkManifest(sampleRoot, target);
  errors.push(...manifestErrors); checks.manifest = manifestErrors.length === 0;
  if (checks.build && projectCheck.project) {
    const smoke = await runtime.runHttpSmoke(sampleRoot, projectCheck.project);
    errors.push(...smoke); checks.httpSmoke = smoke.length === 0;
  }
  if (["bot-ai-messages", "bot-cards"].includes(sample)) {
    const contracts = checks.build ? runtime.runCommand("dotnet", ["test", path.join(repo, "tests/dotnet/teams-sample-sync/TeamsSampleSync.ContractTests.csproj"), "--nologo", "--warnaserror"], repo) : ["Contract tests require a successful sample build"];
    errors.push(...contracts); checks.contracts = contracts.length === 0;
  } else checks.contracts = true;
  return {
    version: 1,
    sample,
    passed: errors.length === 0,
    repairable: true,
    outputDigest: digestDirectory(sampleRoot, excludes),
    checks,
    errors,
    externalValidationRequired: ["Credentialed Teams, Entra, Graph, Azure Bot, and portal behavior when applicable"],
  };
}
