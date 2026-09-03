#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Ajv, type AnySchema, type ErrorObject } from "ajv";
import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync, zipSync } from "fflate";
import { minimatch } from "minimatch";
import { parse, parseDocument, stringify } from "yaml";

export const CONFIG_DIRECTORY = ".github/teams-sample-sync";
const TEAMS_EXTENSION_LINK =
  "https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/teams/teams-extension?pivots=dotnet";
const REQUIRED_AGENT_PACKAGES = [
  "Microsoft.Agents.Authentication.Msal",
  "Microsoft.Agents.Hosting.AspNetCore",
  "Microsoft.Agents.Extensions.MSTeams",
] as const;

type Data = Record<string, unknown>;

export interface Decision extends Data {
  id?: string;
  sample?: string;
  status?: string;
}

interface DecisionsConfig extends Data {
  version: number;
  decisions: Decision[];
}

interface ManifestTarget extends Data {
  distribution: string;
  packageDirectory: string;
  placeholderConvention: string;
}

interface SampleTarget extends Data {
  source: string;
  destination: string;
  manifest: ManifestTarget;
}

interface TargetsConfig extends Data {
  version: number;
  upstream: { repository: string; ref: string; root: string };
  destinationRoot: string;
  canonicalSample: string;
  migrationSkill: string;
  manifestSkill: string;
  packagePolicy: { targetFramework: string; agentsSdkVersion: string };
  validatorVersion: string;
  samples: Record<string, SampleTarget>;
}

interface OwnershipConfig extends Data {
  version: number;
  precedence: string[];
  classes: Record<string, string[]>;
  outputDigestExcludes?: string[];
}

interface PlanArgs {
  repoRoot: string;
  configDir?: string;
  upstreamRoot: string;
  upstreamCommit?: string;
  sample?: string;
  excludeDecisionId?: string;
}

export interface AgentInputArgs {
  repoRoot: string;
  configDir?: string;
  plan: string;
  sample: string;
}

export interface PrepareManifestArgs {
  repoRoot: string;
  configDir?: string;
  sample: string;
}

export interface VerifyArgs {
  repoRoot: string;
  configDir?: string;
  sample: string;
  runBuild?: boolean;
  noRestore?: boolean;
  validateSchema?: boolean;
  allowProposed?: boolean;
}

interface FinalizeArgs {
  repoRoot: string;
  configDir?: string;
  sample: string;
  plan: string;
  firstVerification: string;
  secondVerification: string;
}

interface CaptureProposalArgs {
  repoRoot: string;
  configDir?: string;
  sample: string;
  plan: string;
  verification: string;
}

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncError";
  }
}

function isRecord(value: unknown): value is Data {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, description: string): Data {
  if (!isRecord(value)) {
    throw new SyncError(`Expected a mapping in ${description}`);
  }
  return value;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function sha256Buffer(value: Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function readUtf8(filePath: string): string {
  const text = readFileSync(filePath, "utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function loadYaml(filePath: string): Data {
  try {
    return requireRecord(parse(readUtf8(filePath)), filePath);
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError(`Cannot read YAML ${filePath}: ${errorMessage(error)}`);
  }
}

export function loadJson(filePath: string): Data {
  try {
    return requireRecord(JSON.parse(readUtf8(filePath)), filePath);
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError(`Cannot read JSON ${filePath}: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runGit(repository: string, args: string[], allowFailure = false): string | undefined {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    if (allowFailure) return undefined;
    const detail = String(result.stderr || result.stdout || result.error?.message || "unknown error").trim();
    throw new SyncError(`Git command failed: ${args.join(" ")}: ${detail}`);
  }
  return String(result.stdout).trim();
}

function runGitBuffer(repository: string, args: string[], allowFailure = false): Buffer | undefined {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "buffer",
    maxBuffer: 30 * 1024 * 1024,
  });
  if (result.status !== 0) {
    if (allowFailure) return undefined;
    const detail = Buffer.concat([
      Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0),
      Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0),
    ]).toString("utf8").trim();
    throw new SyncError(`Git command failed: ${args.join(" ")}: ${detail || "unknown error"}`);
  }
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0);
}

function isRelativeRepositoryPath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return (
    value.length > 0 &&
    !path.posix.isAbsolute(normalized) &&
    !path.win32.isAbsolute(value) &&
    !normalized.split("/").includes("..")
  );
}

function isRelativeRepositorySubdirectory(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return (
    isRelativeRepositoryPath(value) &&
    normalized !== "." &&
    normalized !== "./" &&
    normalized.split("/").every((part) => part !== "" && part !== ".")
  );
}

function containedPath(repositoryRoot: string, ...parts: string[]): string {
  const candidate = path.resolve(repositoryRoot, ...parts);
  const relative = path.relative(repositoryRoot, candidate);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new SyncError(`Path is outside the repository: ${candidate}`);
  }
  return candidate;
}

function rejectSymlinkComponents(repositoryRoot: string, candidate: string): void {
  const relative = path.relative(repositoryRoot, candidate);
  let current = repositoryRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new SyncError(`Symbolic links are not supported in manifest package paths: ${current}`);
    }
  }
}

export function validateConfiguration(
  targetsValue: Data,
  decisionsValue: Data,
  ownershipValue: Data,
): asserts targetsValue is TargetsConfig {
  if (targetsValue.version !== 1 || decisionsValue.version !== 1 || ownershipValue.version !== 1) {
    throw new SyncError("All sync configuration files must use version 1");
  }
  const required = [
    "upstream",
    "destinationRoot",
    "canonicalSample",
    "migrationSkill",
    "manifestSkill",
    "packagePolicy",
    "validatorVersion",
    "samples",
  ];
  const missing = required.filter((name) => !(name in targetsValue));
  if (missing.length > 0) {
    throw new SyncError(`targets.yml is missing: ${missing.join(", ")}`);
  }
  if (!isRecord(targetsValue.samples) || Object.keys(targetsValue.samples).length === 0) {
    throw new SyncError("targets.yml must select at least one sample");
  }
  for (const field of ["destinationRoot", "canonicalSample"] as const) {
    if (
      typeof targetsValue[field] !== "string" ||
      !isRelativeRepositorySubdirectory(targetsValue[field])
    ) {
      throw new SyncError(`targets.yml has unsafe ${field} path`);
    }
  }
  const destinations = new Set<string>();
  for (const [name, sampleValue] of Object.entries(targetsValue.samples)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      throw new SyncError(`Invalid sample name: ${name}`);
    }
    if (!isRecord(sampleValue)) {
      throw new SyncError(`Sample ${name} must be a mapping`);
    }
    for (const field of ["source", "destination", "manifest"] as const) {
      if (!(field in sampleValue)) throw new SyncError(`Sample ${name} is missing ${field}`);
    }
    for (const field of ["source", "destination"] as const) {
      if (typeof sampleValue[field] !== "string" || !isRelativeRepositoryPath(sampleValue[field])) {
        throw new SyncError(`Sample ${name} has unsafe ${field} path`);
      }
    }
    if (!isRecord(sampleValue.manifest)) {
      throw new SyncError(`Sample ${name} manifest must be a mapping`);
    }
    if (
      typeof sampleValue.manifest.packageDirectory !== "string" ||
      !isRelativeRepositorySubdirectory(sampleValue.manifest.packageDirectory)
    ) {
      throw new SyncError(`Sample ${name} has unsafe manifest packageDirectory path`);
    }
    const destination = String(sampleValue.destination);
    if (destinations.has(destination)) throw new SyncError(`Duplicate destination: ${destination}`);
    destinations.add(destination);
  }
  if (!Array.isArray(decisionsValue.decisions)) {
    throw new SyncError("decisions.yml decisions must be a list");
  }
  const classes = ownershipValue.classes;
  const precedence = ownershipValue.precedence;
  if (!isRecord(classes) || !Array.isArray(precedence)) {
    throw new SyncError("ownership.yml must define classes and precedence");
  }
  const undefinedClasses = precedence.filter(
    (name) => typeof name !== "string" || !(name in classes),
  );
  if (undefinedClasses.length > 0) {
    throw new SyncError(
      `Ownership precedence references undefined classes: ${JSON.stringify(undefinedClasses)}`,
    );
  }
}

function loadConfiguration(repositoryRoot: string, configDir: string): {
  targets: TargetsConfig;
  decisions: DecisionsConfig;
  ownership: OwnershipConfig;
} {
  const configRoot = path.join(repositoryRoot, configDir);
  const targetsValue = loadYaml(path.join(configRoot, "targets.yml"));
  const decisionsValue = loadYaml(path.join(configRoot, "decisions.yml"));
  const ownershipValue = loadYaml(path.join(configRoot, "ownership.yml"));
  validateConfiguration(targetsValue, decisionsValue, ownershipValue);
  return {
    targets: targetsValue as TargetsConfig,
    decisions: decisionsValue as unknown as DecisionsConfig,
    ownership: ownershipValue as unknown as OwnershipConfig,
  };
}

export function matchesPattern(relativePath: string, pattern: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/");
  return (
    minimatch(normalized, pattern, { dot: true }) ||
    minimatch(normalized, `**/${pattern}`, { dot: true })
  );
}

export function ownershipClass(
  relativePath: string,
  ownership: OwnershipConfig,
): string | undefined {
  for (const className of ownership.precedence) {
    for (const pattern of ownership.classes[className] ?? []) {
      if (matchesPattern(relativePath, pattern)) return className;
    }
  }
  return undefined;
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new SyncError(`Symbolic links are not supported in synchronized trees: ${absolute}`);
      }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(root);
  return files;
}

export function directoryDigest(root: string, excludes: string[] = []): string {
  if (!existsSync(root)) return sha256Text("<missing>");
  const digest = createHash("sha256");
  const files = listFiles(root).sort((left, right) => {
    const leftRelative = relativePosix(root, left);
    const rightRelative = relativePosix(root, right);
    return leftRelative < rightRelative ? -1 : leftRelative > rightRelative ? 1 : 0;
  });
  for (const filePath of files) {
    const relative = relativePosix(root, filePath);
    if (excludes.some((pattern) => matchesPattern(relative, pattern))) continue;
    digest.update(relative, "utf8");
    digest.update("\0");
    digest.update(readFileSync(filePath));
    digest.update("\0");
  }
  return `sha256:${digest.digest("hex")}`;
}

export function gitDirectoryDigest(
  repositoryRoot: string,
  relativeRoot: string,
  ref = "HEAD",
  excludes: string[] = [],
): string {
  const normalizedRoot = relativeRoot.replaceAll("\\", "/").replace(/\/$/, "");
  const output = runGit(repositoryRoot, ["ls-tree", "-r", "--name-only", ref, "--", normalizedRoot]);
  const files = (output ?? "")
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
  if (files.length === 0) return sha256Text("<missing>");
  const digest = createHash("sha256");
  for (const repositoryPath of files) {
    const relative = repositoryPath.slice(normalizedRoot.length + 1);
    if (excludes.some((pattern) => matchesPattern(relative, pattern))) continue;
    const content = runGitBuffer(repositoryRoot, ["show", `${ref}:${repositoryPath}`]);
    if (!content) throw new SyncError(`Cannot read ${repositoryPath} at ${ref}`);
    digest.update(relative, "utf8");
    digest.update("\0");
    digest.update(content);
    digest.update("\0");
  }
  return `sha256:${digest.digest("hex")}`;
}

function relativePosix(root: string, target: string): string {
  return path.relative(root, target).replaceAll("\\", "/");
}

export function applicableDecisions(
  decisions: DecisionsConfig,
  sampleName: string,
): { durable: Decision[]; proposed: Decision[] } {
  const durable: Decision[] = [];
  const proposed: Decision[] = [];
  for (const decision of decisions.decisions) {
    if (!isRecord(decision) || (decision.sample !== sampleName && decision.sample !== "*")) continue;
    if (decision.status === "approved" || decision.status === "rejected") durable.push(decision);
    else if (decision.status === "proposed") proposed.push(decision);
  }
  const byId = (left: Decision, right: Decision): number => {
    const leftId = String(left.id ?? "");
    const rightId = String(right.id ?? "");
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  };
  return { durable: durable.sort(byId), proposed: proposed.sort(byId) };
}

function sourceTreeId(
  upstreamRepository: string,
  commit: string,
  upstreamRoot: string,
  sourcePath: string,
): string | undefined {
  const gitPath = `${upstreamRoot.replace(/\/$/, "")}/${sourcePath.replace(/^\//, "")}`;
  return runGit(upstreamRepository, ["rev-parse", `${commit}:${gitPath}`], true);
}

function upstreamInventory(upstreamRepository: string, commit: string, upstreamRoot: string): string[] {
  const output = runGit(upstreamRepository, [
    "ls-tree",
    "-d",
    "--name-only",
    `${commit}:${upstreamRoot.replace(/\/$/, "")}`,
  ]);
  return (output ?? "")
    .split(/\r?\n/)
    .filter((name) => name.length > 0 && name.toLowerCase() !== "archived")
    .sort();
}

function sampleComponentDigests(
  repositoryRoot: string,
  targets: TargetsConfig,
  decisions: DecisionsConfig,
  ownership: OwnershipConfig,
  sampleName: string,
  treeId: string,
): { components: Record<string, string>; sampleDecisions: ReturnType<typeof applicableDecisions> } {
  const sampleDecisions = applicableDecisions(decisions, sampleName);
  const targetContext = {
    upstream: targets.upstream,
    destinationRoot: targets.destinationRoot,
    canonicalSample: targets.canonicalSample,
    packagePolicy: targets.packagePolicy,
    validatorVersion: targets.validatorVersion,
    sample: targets.samples[sampleName],
  };
  const components = {
    sourceTree: treeId,
    target: sha256Text(canonicalJson(targetContext)),
    decisions: sha256Text(canonicalJson(sampleDecisions.durable)),
    ownership: sha256Text(canonicalJson(ownership)),
    migrationSkill: directoryDigest(path.join(repositoryRoot, targets.migrationSkill)),
    manifestSkill: directoryDigest(path.join(repositoryRoot, targets.manifestSkill)),
    canonicalSample: directoryDigest(path.join(repositoryRoot, targets.canonicalSample), [
      "bin/**",
      "obj/**",
    ]),
    packagePolicy: sha256Text(canonicalJson(targets.packagePolicy)),
    validator: sha256Text(String(targets.validatorVersion)),
  };
  return { components, sampleDecisions };
}

export function buildPlan(args: PlanArgs): Data {
  const repositoryRoot = path.resolve(args.repoRoot);
  const configDir = args.configDir ?? CONFIG_DIRECTORY;
  const { targets, decisions, ownership } = loadConfiguration(repositoryRoot, configDir);
  const effectiveDecisions = args.excludeDecisionId
    ? {
        ...decisions,
        decisions: decisions.decisions.filter((item) => item.id !== args.excludeDecisionId),
      }
    : decisions;
  if (
    args.excludeDecisionId &&
    effectiveDecisions.decisions.length !== decisions.decisions.length - 1
  ) {
    throw new SyncError(`Expected one decision to exclude: ${args.excludeDecisionId}`);
  }
  const upstreamRepository = path.resolve(args.upstreamRoot);
  const commit = args.upstreamCommit ?? runGit(upstreamRepository, ["rev-parse", "HEAD"]);
  if (!commit) throw new SyncError("Cannot resolve upstream commit");

  let selectedNames = Object.keys(targets.samples).sort();
  if (args.sample) {
    if (!(args.sample in targets.samples)) throw new SyncError(`Sample is not selected: ${args.sample}`);
    selectedNames = [args.sample];
  }

  const inventory = upstreamInventory(upstreamRepository, commit, targets.upstream.root);
  const candidates = inventory.filter((name) => !(name in targets.samples));
  const samplePlans: Record<string, Data> = {};
  const matrix: Array<{ sample: string }> = [];

  for (const sampleName of selectedNames) {
    const sample = targets.samples[sampleName]!;
    const treeId = sourceTreeId(
      upstreamRepository,
      commit,
      targets.upstream.root,
      sample.source,
    );
    const statePath = path.join(repositoryRoot, configDir, "state", `${sampleName}.lock.json`);
    const prior = existsSync(statePath) ? loadJson(statePath) : {};
    const destination = path.join(repositoryRoot, targets.destinationRoot, sample.destination);
    if (!treeId) {
      samplePlans[sampleName] = {
        status: "upstream-removed",
        requiresAgent: false,
        destination: relativePosix(repositoryRoot, destination),
        previousState: prior,
      };
      continue;
    }

    const { components, sampleDecisions } = sampleComponentDigests(
      repositoryRoot,
      targets,
      effectiveDecisions,
      ownership,
      sampleName,
      treeId,
    );
    const inputDigest = sha256Text(canonicalJson(components));
    const priorComponents = isRecord(prior.componentDigests) ? prior.componentDigests : {};
    const changed = prior.inputDigest !== inputDigest;
    const changedComponents = Object.entries(components)
      .filter(([key, value]) => priorComponents[key] !== value)
      .map(([key]) => key)
      .sort();
    samplePlans[sampleName] = {
      status: changed ? "pending" : "unchanged",
      requiresAgent: changed,
      upstreamCommit: commit,
      sourceTree: treeId,
      inputDigest,
      changedComponents,
      componentDigests: components,
      target: sample,
      destination: relativePosix(repositoryRoot, destination),
      decisions: sampleDecisions,
      previousState: prior,
      ownership,
    };
    if (changed) matrix.push({ sample: sampleName });
  }

  return {
    version: 1,
    upstreamCommit: commit,
    newSampleCandidates: candidates,
    matrix,
    samples: samplePlans,
  };
}

export function buildAgentInput(args: AgentInputArgs): Data {
  const repositoryRoot = path.resolve(args.repoRoot);
  const { targets } = loadConfiguration(repositoryRoot, args.configDir ?? CONFIG_DIRECTORY);
  const plan = loadJson(path.resolve(args.plan));
  const samples = requireRecord(plan.samples, "plan.samples");
  const selected = requireRecord(samples[args.sample], `plan.samples.${args.sample}`);
  const fields = [
    "status",
    "changedComponents",
    "sourceTree",
    "upstreamCommit",
    "destination",
    "target",
    "ownership",
    "decisions",
  ] as const;
  const sample = Object.fromEntries(fields.map((field) => [field, selected[field]]));
  return {
    version: 1,
    upstreamCommit: plan.upstreamCommit,
    sampleName: args.sample,
    repository: {
      upstream: targets.upstream,
      destinationRoot: targets.destinationRoot,
      canonicalSample: targets.canonicalSample,
      migrationSkill: targets.migrationSkill,
      manifestSkill: targets.manifestSkill,
      packagePolicy: targets.packagePolicy,
    },
    sample,
  };
}

export function prepareManifestPackage(args: PrepareManifestArgs): Data {
  const repositoryRoot = path.resolve(args.repoRoot);
  const { targets } = loadConfiguration(repositoryRoot, args.configDir ?? CONFIG_DIRECTORY);
  const target = targets.samples[args.sample];
  if (!target) throw new SyncError(`Sample is not selected: ${args.sample}`);

  const sampleRoot = containedPath(repositoryRoot, targets.destinationRoot, target.destination);
  const packageRoot = containedPath(
    repositoryRoot,
    targets.destinationRoot,
    target.destination,
    target.manifest.packageDirectory,
  );
  rejectSymlinkComponents(repositoryRoot, sampleRoot);
  rejectSymlinkComponents(repositoryRoot, packageRoot);
  const directoryAlreadyExisted = existsSync(packageRoot);
  mkdirSync(packageRoot, { recursive: true });

  const canonicalPackageRoot = containedPath(repositoryRoot, targets.canonicalSample, "appManifest");
  rejectSymlinkComponents(repositoryRoot, canonicalPackageRoot);
  const copiedIcons: string[] = [];
  const iconDigests: Record<string, string> = {};
  for (const iconName of ["color.png", "outline.png"] as const) {
    const destination = path.join(packageRoot, iconName);
    const source = path.join(canonicalPackageRoot, iconName);
    rejectSymlinkComponents(repositoryRoot, destination);
    rejectSymlinkComponents(repositoryRoot, source);
    if (existsSync(destination)) {
      if (!statSync(destination).isFile()) {
        throw new SyncError(`Manifest icon path is not a file: ${destination}`);
      }
      continue;
    }
    if (!existsSync(source) || !statSync(source).isFile()) {
      throw new SyncError(`Canonical manifest icon does not exist: ${source}`);
    }
    copyFileSync(source, destination);
    copiedIcons.push(iconName);
    iconDigests[iconName] = sha256Buffer(readFileSync(destination));
  }
  for (const iconName of ["color.png", "outline.png"] as const) {
    if (!(iconName in iconDigests)) {
      iconDigests[iconName] = sha256Buffer(readFileSync(path.join(packageRoot, iconName)));
    }
  }

  return {
    version: 1,
    sample: args.sample,
    packageDirectory: relativePosix(repositoryRoot, packageRoot),
    createdDirectory: !directoryAlreadyExisted,
    copiedIcons,
    iconDigests,
  };
}

function collectKeyPaths(value: unknown, prefix = ""): Set<string> {
  const paths = new Set<string>();
  if (!isRecord(value)) return paths;
  for (const [key, child] of Object.entries(value)) {
    const childPrefix = prefix ? `${prefix}.${key}` : key;
    paths.add(childPrefix);
    for (const childPath of collectKeyPaths(child, childPrefix)) paths.add(childPath);
  }
  return paths;
}

export function renderValidationPlaceholders(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(renderValidationPlaceholders);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderValidationPlaceholders(item)]),
    );
  }
  if (typeof value !== "string") return value;

  const replacement = (_match: string, capturedName: string): string => {
    const name = capturedName.toUpperCase();
    if (name.includes("ID")) return "00000000-0000-4000-8000-000000000000";
    if (name.includes("DOMAIN") || name.includes("HOST")) return "example.com";
    if (name.includes("URL")) return "https://example.com";
    if (name.includes("SUFFIX")) return "-local";
    return "placeholder";
  };
  return value
    .replace(/\$\{\{([^{}]+)\}\}/g, replacement)
    .replace(/<<([^<>]+)>>/g, replacement);
}

function parseManifestJson(text: string): Data {
  const parsed = JSON.parse(text) as unknown;
  const document = parseDocument(text, { uniqueKeys: true });
  const duplicate = document.errors.find((error) => error.code === "DUPLICATE_KEY");
  if (duplicate) throw new Error(duplicate.message);
  return requireRecord(parsed, "manifest.json");
}

async function fetchSchema(schemaUrl: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(schemaUrl, {
      headers: { "User-Agent": "teams-sample-sync/1" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 5_000_000) throw new Error("schema response exceeds 5 MB");
    return JSON.parse(strFromU8(bytes));
  } finally {
    clearTimeout(timer);
  }
}

function schemaErrorText(error: ErrorObject): string {
  const location = error.instancePath.replace(/^\//, "").replaceAll("/", ".") || "<root>";
  return `Manifest schema error at ${location}: ${error.message ?? error.keyword}`;
}

export async function checkManifest(
  sampleRoot: string,
  packageDirectory: string,
  validateSchema: boolean,
): Promise<string[]> {
  const errors: string[] = [];
  const packageRoot = path.join(sampleRoot, packageDirectory);
  const manifestPath = path.join(packageRoot, "manifest.json");
  if (!existsSync(manifestPath)) return [`Missing ${packageDirectory}/manifest.json`];

  for (const misplacedName of ["manifest.json", "color.png", "outline.png"] as const) {
    if (existsSync(path.join(sampleRoot, misplacedName))) {
      errors.push(`Manifest asset is outside ${packageDirectory}: ${misplacedName}`);
    }
  }

  let manifestText: string;
  let manifest: Data;
  try {
    manifestText = readUtf8(manifestPath);
    manifest = parseManifestJson(manifestText);
  } catch (error) {
    return [`Invalid manifest JSON: ${errorMessage(error)}`];
  }
  if (/(?<!\$)\{\{[^{}]+\}\}/.test(manifestText)) {
    errors.push("Manifest contains unresolved authoring placeholders");
  }
  for (const key of ["$schema", "manifestVersion", "version", "id", "name", "description", "icons"]) {
    if (!(key in manifest)) errors.push(`Manifest is missing ${key}`);
  }

  const icons = isRecord(manifest.icons) ? manifest.icons : {};
  const validIconPaths: string[] = [];
  for (const iconName of ["color", "outline"] as const) {
    const iconPath = icons[iconName];
    if (!iconPath) errors.push(`Manifest is missing icons.${iconName}`);
    else if (
      !isRelativeRepositoryPath(String(iconPath)) ||
      path.posix.basename(String(iconPath).replaceAll("\\", "/")) !== String(iconPath)
    ) {
      errors.push(`Manifest icon must be a file at the package root: ${String(iconPath)}`);
    } else {
      const absoluteIconPath = path.join(packageRoot, String(iconPath));
      if (!existsSync(absoluteIconPath) || !statSync(absoluteIconPath).isFile()) {
        errors.push(`Manifest icon does not exist: ${String(iconPath)}`);
      } else validIconPaths.push(absoluteIconPath);
    }
  }

  const schemaUrl = manifest.$schema;
  const version = manifest.manifestVersion;
  if (typeof schemaUrl === "string" && typeof version === "string") {
    let parsedUrl: URL | undefined;
    try {
      parsedUrl = new URL(schemaUrl);
    } catch {
      // The common error below is more useful than the URL parser error.
    }
    const expectedSuffix = `/json-schemas/teams/v${version}/MicrosoftTeams.schema.json`;
    if (
      !parsedUrl ||
      parsedUrl.protocol !== "https:" ||
      parsedUrl.hostname !== "developer.microsoft.com" ||
      !parsedUrl.pathname.endsWith(expectedSuffix)
    ) {
      errors.push("Manifest $schema does not match manifestVersion on developer.microsoft.com");
    } else if (validateSchema) {
      try {
        const schema = await fetchSchema(schemaUrl);
        const ajv = new Ajv({
          allErrors: true,
          strict: false,
          unicodeRegExp: false,
          validateSchema: false,
          logger: false,
        });
        const validate = ajv.compile(schema as AnySchema);
        if (!validate(renderValidationPlaceholders(manifest))) {
          errors.push(...(validate.errors ?? []).slice(0, 10).map(schemaErrorText));
        }
      } catch (error) {
        errors.push(`Cannot validate released manifest schema: ${errorMessage(error)}`);
      }
    }
  }

  const packagePaths = [manifestPath, ...validIconPaths];
  if (packagePaths.every((filePath) => existsSync(filePath) && statSync(filePath).isFile())) {
    const packageFiles = Object.fromEntries(
      packagePaths.map((filePath) => [path.basename(filePath), new Uint8Array(readFileSync(filePath))]),
    );
    const names = Object.keys(unzipSync(zipSync(packageFiles))).sort();
    const expectedNames = packagePaths.map((filePath) => path.basename(filePath)).sort();
    if (canonicalJson(names) !== canonicalJson(expectedNames)) {
      errors.push("Manifest package files are not at the ZIP root");
    }
  }
  return errors;
}

function findValuesByKey(value: unknown, targetKey: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap((item) => findValuesByKey(item, targetKey));
  if (!isRecord(value)) return [];
  const values: unknown[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === targetKey) values.push(...(Array.isArray(child) ? child : [child]));
    values.push(...findValuesByKey(child, targetKey));
  }
  return values;
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isRecord(value) && typeof value["#text"] === "string") return value["#text"];
  return undefined;
}

export function checkProject(
  sampleRoot: string,
  expectedVersion: string,
  targetFramework: string,
): string[] {
  const errors: string[] = [];
  const projects = existsSync(sampleRoot)
    ? readdirSync(sampleRoot)
        .filter((name) => name.endsWith(".csproj"))
        .sort()
    : [];
  if (projects.length !== 1) return [`Expected one project file, found ${projects.length}`];

  let document: unknown;
  try {
    document = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" }).parse(
      readUtf8(path.join(sampleRoot, projects[0]!)),
    );
  } catch (error) {
    return [`Invalid project XML: ${errorMessage(error)}`];
  }
  const framework = scalarText(findValuesByKey(document, "TargetFramework")[0]);
  if (framework !== targetFramework) {
    errors.push(`TargetFramework must be ${targetFramework}, found ${String(framework)}`);
  }
  if (scalarText(findValuesByKey(document, "ImplicitUsings")[0]) !== "disable") {
    errors.push("ImplicitUsings must be disable");
  }
  if (scalarText(findValuesByKey(document, "Nullable")[0]) !== "enable") {
    errors.push("Nullable must be enable");
  }

  const packages = new Map<string, string | undefined>();
  for (const packageReference of findValuesByKey(document, "PackageReference")) {
    if (!isRecord(packageReference)) continue;
    const include = scalarText(packageReference.Include);
    if (include) packages.set(include, scalarText(packageReference.Version));
  }
  for (const packageName of [...REQUIRED_AGENT_PACKAGES].sort()) {
    if (packages.get(packageName) !== expectedVersion) {
      errors.push(`${packageName} must use ${expectedVersion}`);
    }
  }
  return errors;
}

export function checkAgentStructure(sampleRoot: string): string[] {
  const errors: string[] = [];
  const sources = listFiles(sampleRoot).filter((filePath) => filePath.endsWith(".cs"));
  const contents = sources.map(readUtf8).join("\n");
  if ((contents.match(/\[TeamsExtension\]/g) ?? []).length !== 1) {
    errors.push("Expected exactly one [TeamsExtension] attribute");
  }
  if (!/partial\s+class\s+\w+[\s\S]*?:\s*AgentApplication/.test(contents)) {
    errors.push("Missing partial AgentApplication subclass");
  }
  const programPath = path.join(sampleRoot, "Program.cs");
  if (!existsSync(programPath)) errors.push("Missing Program.cs");
  else {
    const program = readUtf8(programPath);
    for (const text of ["AddTeams(", "UseTeams(", "builder.Services.AddHttpClient()", "authenticationConfigured"]) {
      if (program.includes(text)) errors.push(`Program.cs contains forbidden text: ${text}`);
    }
  }
  if (listFiles(sampleRoot).some((filePath) => path.basename(filePath) === ".gitignore")) {
    errors.push("Destination sample contains .gitignore");
  }
  return errors;
}

export function checkQuickstartBaseline(
  repositoryRoot: string,
  targets: TargetsConfig,
  sampleRoot: string,
): string[] {
  const errors: string[] = [];
  const quickstart = path.join(repositoryRoot, targets.canonicalSample);
  try {
    const canonicalSettings = JSON.parse(readUtf8(path.join(quickstart, "appsettings.json"))) as unknown;
    const sampleSettings = JSON.parse(readUtf8(path.join(sampleRoot, "appsettings.json"))) as unknown;
    const sampleKeys = collectKeyPaths(sampleSettings);
    const missing = [...collectKeyPaths(canonicalSettings)].filter((key) => !sampleKeys.has(key)).sort();
    if (missing.length > 0) errors.push(`appsettings.json misses canonical keys: ${missing.join(", ")}`);
  } catch (error) {
    errors.push(`Cannot compare appsettings.json: ${errorMessage(error)}`);
  }

  try {
    const launch = requireRecord(
      JSON.parse(readUtf8(path.join(sampleRoot, "Properties", "launchSettings.json"))),
      "launchSettings.json",
    );
    const canonicalLaunch = requireRecord(
      JSON.parse(readUtf8(path.join(quickstart, "Properties", "launchSettings.json"))),
      "canonical launchSettings.json",
    );
    const launchProfiles = isRecord(launch.profiles) ? Object.values(launch.profiles) : [];
    const canonicalProfiles = isRecord(canonicalLaunch.profiles)
      ? Object.values(canonicalLaunch.profiles)
      : [];
    if (canonicalJson(launchProfiles) !== canonicalJson(canonicalProfiles)) {
      errors.push("launchSettings.json differs from quickstart beyond profile name");
    }
  } catch (error) {
    errors.push(`Cannot compare launchSettings.json: ${errorMessage(error)}`);
  }

  try {
    if (!readUtf8(path.join(sampleRoot, "README.md")).includes(TEAMS_EXTENSION_LINK)) {
      errors.push("README is missing the Teams extension link");
    }
  } catch (error) {
    errors.push(`Cannot read README.md: ${errorMessage(error)}`);
  }
  return errors;
}

function runBuild(sampleRoot: string, noRestore: boolean): string[] {
  const project = readdirSync(sampleRoot)
    .filter((name) => name.endsWith(".csproj"))
    .sort()[0];
  if (!project) return ["Cannot build without a project file"];
  const command = ["build", path.join(sampleRoot, project), "--nologo", "--verbosity", "minimal"];
  if (noRestore) command.push("--no-restore");
  const result = spawnSync("dotnet", command, {
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = `${String(result.stdout)}\n${String(result.stderr)}`.trim();
    return [`dotnet build failed:\n${detail}`];
  }
  const warningMatch = /(\d+) Warning\(s\)/.exec(String(result.stdout));
  return warningMatch && warningMatch[1] !== "0"
    ? [`dotnet build produced ${warningMatch[1]} warnings`]
    : [];
}

export async function verifySample(args: VerifyArgs): Promise<Data> {
  const repositoryRoot = path.resolve(args.repoRoot);
  const configDir = args.configDir ?? CONFIG_DIRECTORY;
  const { targets, decisions, ownership } = loadConfiguration(repositoryRoot, configDir);
  if (!(args.sample in targets.samples)) throw new SyncError(`Sample is not selected: ${args.sample}`);
  const target = targets.samples[args.sample]!;
  const sampleDecisions = applicableDecisions(decisions, args.sample);
  const sampleRoot = path.join(repositoryRoot, targets.destinationRoot, target.destination);
  const errors: string[] = [];
  if (sampleDecisions.proposed.length > 1) {
    const ids = sampleDecisions.proposed.map((item) => String(item.id ?? "<missing-id>")).join(", ");
    errors.push(`Only one proposed decision is allowed per sample: ${ids}`);
  } else if (sampleDecisions.proposed.length > 0 && !args.allowProposed) {
    const ids = sampleDecisions.proposed.map((item) => String(item.id ?? "<missing-id>")).join(", ");
    errors.push(`Proposed decisions require human review: ${ids}`);
  }

  let outputDigest: string;
  if (!existsSync(sampleRoot) || !statSync(sampleRoot).isDirectory()) {
    errors.push(`Destination sample does not exist: ${sampleRoot}`);
    outputDigest = sha256Text("<missing>");
  } else {
    outputDigest = directoryDigest(sampleRoot, ownership.outputDigestExcludes ?? []);
    errors.push(
      ...checkProject(
        sampleRoot,
        targets.packagePolicy.agentsSdkVersion,
        targets.packagePolicy.targetFramework,
      ),
      ...checkAgentStructure(sampleRoot),
      ...checkQuickstartBaseline(repositoryRoot, targets, sampleRoot),
      ...(await checkManifest(sampleRoot, target.manifest.packageDirectory, args.validateSchema ?? false)),
    );
    if (args.runBuild) errors.push(...runBuild(sampleRoot, args.noRestore ?? false));
  }
  return {
    version: 1,
    sample: args.sample,
    passed: errors.length === 0,
    stateEligible: errors.length === 0 && sampleDecisions.proposed.length === 0,
    proposedDecisionIds: sampleDecisions.proposed.map((item) => item.id),
    outputDigest,
    errors,
    externalValidationRequired: [
      "Microsoft Teams, Entra, Graph, Azure Bot, and portal behavior when applicable",
    ],
  };
}

export function captureProposal(args: CaptureProposalArgs): Data {
  const repositoryRoot = path.resolve(args.repoRoot);
  const configDir = args.configDir ?? CONFIG_DIRECTORY;
  const { targets, decisions, ownership } = loadConfiguration(repositoryRoot, configDir);
  if (!(args.sample in targets.samples)) throw new SyncError(`Sample is not selected: ${args.sample}`);
  const proposals = applicableDecisions(decisions, args.sample).proposed;
  if (proposals.length !== 1) {
    throw new SyncError(`Expected one proposed decision for ${args.sample}, found ${proposals.length}`);
  }
  const decision = proposals[0]!;
  const decisionId = String(decision.id ?? "");
  if (!/^DEC-[0-9]+$/.test(decisionId)) throw new SyncError(`Invalid proposed decision ID: ${decisionId}`);
  if (decision.sample !== args.sample) throw new SyncError("A proposed decision must name one selected sample");
  if (decision.proposal !== undefined) throw new SyncError(`Decision ${decisionId} already has proposal metadata`);
  for (const field of ["question", "recommendation", "evidence", "impact", "invalidatesOn"]) {
    if (typeof decision[field] !== "string" || decision[field] === "") {
      throw new SyncError(`Decision ${decisionId} is missing ${field}`);
    }
  }
  const decisionsRelative = path.posix.join(configDir.replaceAll("\\", "/"), "decisions.yml");
  const checkpointDocument = requireRecord(
    parse(runGit(repositoryRoot, ["show", `HEAD:${decisionsRelative}`]) ?? ""),
    `${decisionsRelative} at proposal checkpoint`,
  );
  const checkpointDecisions = Array.isArray(checkpointDocument.decisions)
    ? checkpointDocument.decisions.filter(isRecord)
    : [];
  const checkpoint = checkpointDecisions.filter((item) => item.id === decisionId);
  if (checkpoint.length !== 1 || checkpoint[0]!.status !== "proposed") {
    throw new SyncError(`Decision ${decisionId} is not in the safe proposal checkpoint`);
  }
  if (canonicalJson(checkpoint[0]) !== canonicalJson(decision)) {
    throw new SyncError(`Decision ${decisionId} changed after the safe proposal checkpoint`);
  }

  const plan = loadJson(args.plan);
  const samples = isRecord(plan.samples) ? plan.samples : {};
  const samplePlan = requireRecord(samples[args.sample], `plan sample ${args.sample}`);
  const verification = loadJson(args.verification);
  if (!verification.passed || verification.sample !== args.sample) {
    throw new SyncError("Cannot capture a proposal from failed or mismatched verification");
  }
  if (
    verification.stateEligible !== false ||
    !Array.isArray(verification.proposedDecisionIds) ||
    canonicalJson(verification.proposedDecisionIds) !== canonicalJson([decisionId])
  ) {
    throw new SyncError("Proposal verification does not identify the exact unresolved decision");
  }
  const target = targets.samples[args.sample]!;
  const sampleRelative = path.posix.join(
    targets.destinationRoot.replaceAll("\\", "/"),
    target.destination.replaceAll("\\", "/"),
  );
  const sampleRoot = path.join(repositoryRoot, sampleRelative);
  const excludes = ownership.outputDigestExcludes ?? [];
  const candidateOutputDigest = directoryDigest(sampleRoot, excludes);
  if (candidateOutputDigest !== verification.outputDigest) {
    throw new SyncError("Candidate output changed after verification");
  }

  runGit(repositoryRoot, ["add", "-N", "--", sampleRelative]);
  const patch = runGitBuffer(repositoryRoot, ["diff", "--binary", "HEAD", "--", sampleRelative]);
  if (!patch || patch.length === 0) throw new SyncError(`Proposal ${decisionId} has no tentative sample change`);
  const patchRelative = path.posix.join(configDir.replaceAll("\\", "/"), "proposals", `${decisionId}.patch`);
  const patchPath = path.join(repositoryRoot, patchRelative);
  mkdirSync(path.dirname(patchPath), { recursive: true });
  writeFileSync(patchPath, patch);

  decision.proposal = {
    upstreamCommit: samplePlan.upstreamCommit,
    sourceTree: samplePlan.sourceTree,
    proposalInputDigest: samplePlan.inputDigest,
    baseOutputDigest: gitDirectoryDigest(repositoryRoot, sampleRelative, "HEAD", excludes),
    candidateOutputDigest,
    patchDigest: sha256Buffer(patch),
    patchPath: patchRelative,
  };
  const decisionsPath = path.join(repositoryRoot, configDir, "decisions.yml");
  writeFileSync(decisionsPath, stringify(decisions, { lineWidth: 0 }), "utf8");
  return {
    version: 1,
    sample: args.sample,
    decisionId,
    stateEligible: false,
    proposal: decision.proposal,
  };
}

export function finalizeState(args: FinalizeArgs): Data {
  const repositoryRoot = path.resolve(args.repoRoot);
  const configDir = args.configDir ?? CONFIG_DIRECTORY;
  const plan = loadJson(args.plan);
  const first = loadJson(args.firstVerification);
  const second = loadJson(args.secondVerification);
  const samples = isRecord(plan.samples) ? plan.samples : {};
  if (!(args.sample in samples)) throw new SyncError(`Plan does not contain sample: ${args.sample}`);
  const samplePlan = requireRecord(samples[args.sample], `plan sample ${args.sample}`);
  if (!first.passed || !second.passed) throw new SyncError("Cannot finalize failed verification");
  if (first.stateEligible === false || second.stateEligible === false) {
    throw new SyncError("Cannot finalize state while a proposed decision is unresolved");
  }
  const plannedDecisions = isRecord(samplePlan.decisions) ? samplePlan.decisions : {};
  if (Array.isArray(plannedDecisions.proposed) && plannedDecisions.proposed.length > 0) {
    throw new SyncError("Cannot finalize a plan that contains a proposed decision");
  }
  if (first.sample !== args.sample || second.sample !== args.sample) {
    throw new SyncError("Verification sample does not match finalization sample");
  }
  if (first.outputDigest !== second.outputDigest) {
    throw new SyncError("Second synchronization changed output; result is non-deterministic");
  }
  const statePath = path.join(repositoryRoot, configDir, "state", `${args.sample}.lock.json`);
  const state = {
    version: 1,
    sample: args.sample,
    upstreamCommit: samplePlan.upstreamCommit,
    sourceTree: samplePlan.sourceTree,
    inputDigest: samplePlan.inputDigest,
    outputDigest: second.outputDigest,
    componentDigests: samplePlan.componentDigests,
    status: "verified",
  };
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(stableValue(state), null, 2)}\n`, "utf8");
  return state;
}

function writeResult(value: Data, output?: string): void {
  const rendered = `${JSON.stringify(stableValue(value), null, 2)}\n`;
  if (output) {
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, rendered, "utf8");
  } else process.stdout.write(rendered);
}

interface ParsedCommand {
  command:
    | "plan"
    | "agent-input"
    | "prepare-manifest"
    | "verify"
    | "capture-proposal"
    | "finalize";
  repoRoot: string;
  configDir: string;
  values: Record<string, string | boolean>;
}

function parseCommandLine(argv: string[], invocationRoot: string): ParsedCommand {
  let repoRoot = invocationRoot;
  let configDir = CONFIG_DIRECTORY;
  let index = 0;
  const commands = new Set([
    "plan",
    "agent-input",
    "prepare-manifest",
    "verify",
    "capture-proposal",
    "finalize",
  ]);
  while (index < argv.length && !commands.has(argv[index]!)) {
    const option = argv[index];
    const value = argv[index + 1];
    if (option === "--repo-root" && value) repoRoot = path.resolve(invocationRoot, value);
    else if (option === "--config-dir" && value) configDir = value;
    else throw new SyncError(`Unknown global option: ${String(option)}`);
    index += 2;
  }
  const command = argv[index] as ParsedCommand["command"] | undefined;
  if (!command) {
    throw new SyncError(
      "Expected command: plan, agent-input, prepare-manifest, verify, capture-proposal, or finalize",
    );
  }
  index += 1;
  const values: Record<string, string | boolean> = {};
  const booleanOptions = new Set(["--run-build", "--no-restore", "--validate-schema", "--allow-proposed"]);
  while (index < argv.length) {
    const option = argv[index]!;
    if (!option.startsWith("--")) throw new SyncError(`Unexpected argument: ${option}`);
    const key = option.slice(2);
    if (booleanOptions.has(option)) {
      values[key] = true;
      index += 1;
    } else {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new SyncError(`Missing value for ${option}`);
      values[key] = value;
      index += 2;
    }
  }
  return { command, repoRoot, configDir, values };
}

function requiredValue(values: Record<string, string | boolean>, name: string): string {
  const value = values[name];
  if (typeof value !== "string") throw new SyncError(`Missing required option: --${name}`);
  return value;
}

function resolveFromInvocation(invocationRoot: string, value: string): string {
  return path.resolve(invocationRoot, value);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const invocationRoot = process.env.INIT_CWD ?? process.cwd();
  try {
    const parsed = parseCommandLine(argv, invocationRoot);
    let result: Data;
    if (parsed.command === "plan") {
      result = buildPlan({
        repoRoot: parsed.repoRoot,
        configDir: parsed.configDir,
        upstreamRoot: resolveFromInvocation(
          invocationRoot,
          requiredValue(parsed.values, "upstream-root"),
        ),
        ...(typeof parsed.values["upstream-commit"] === "string"
          ? { upstreamCommit: parsed.values["upstream-commit"] }
          : {}),
        ...(typeof parsed.values.sample === "string" ? { sample: parsed.values.sample } : {}),
        ...(typeof parsed.values["exclude-decision"] === "string"
          ? { excludeDecisionId: parsed.values["exclude-decision"] }
          : {}),
      });
    } else if (parsed.command === "agent-input") {
      result = buildAgentInput({
        repoRoot: parsed.repoRoot,
        configDir: parsed.configDir,
        plan: resolveFromInvocation(invocationRoot, requiredValue(parsed.values, "plan")),
        sample: requiredValue(parsed.values, "sample"),
      });
    } else if (parsed.command === "prepare-manifest") {
      result = prepareManifestPackage({
        repoRoot: parsed.repoRoot,
        configDir: parsed.configDir,
        sample: requiredValue(parsed.values, "sample"),
      });
    } else if (parsed.command === "verify") {
      result = await verifySample({
        repoRoot: parsed.repoRoot,
        configDir: parsed.configDir,
        sample: requiredValue(parsed.values, "sample"),
        runBuild: parsed.values["run-build"] === true,
        noRestore: parsed.values["no-restore"] === true,
        validateSchema: parsed.values["validate-schema"] === true,
        allowProposed: parsed.values["allow-proposed"] === true,
      });
    } else if (parsed.command === "capture-proposal") {
      result = captureProposal({
        repoRoot: parsed.repoRoot,
        configDir: parsed.configDir,
        sample: requiredValue(parsed.values, "sample"),
        plan: resolveFromInvocation(invocationRoot, requiredValue(parsed.values, "plan")),
        verification: resolveFromInvocation(
          invocationRoot,
          requiredValue(parsed.values, "verification"),
        ),
      });
    } else {
      result = finalizeState({
        repoRoot: parsed.repoRoot,
        configDir: parsed.configDir,
        sample: requiredValue(parsed.values, "sample"),
        plan: resolveFromInvocation(invocationRoot, requiredValue(parsed.values, "plan")),
        firstVerification: resolveFromInvocation(
          invocationRoot,
          requiredValue(parsed.values, "first-verification"),
        ),
        secondVerification: resolveFromInvocation(
          invocationRoot,
          requiredValue(parsed.values, "second-verification"),
        ),
      });
    }
    const output =
      typeof parsed.values.output === "string"
        ? resolveFromInvocation(invocationRoot, parsed.values.output)
        : undefined;
    writeResult(result, output);
    if (parsed.command === "verify" && !result.passed) {
      const errors = Array.isArray(result.errors) ? result.errors : ["Unknown verification failure"];
      for (const error of errors) process.stderr.write(`Verification failed: ${String(error)}\n`);
      return 1;
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: errorMessage(error) })}\n`);
    return 2;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  process.exitCode = await main();
}
