import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Ajv } from "ajv";
import { setTimeout as delay } from "node:timers/promises";
import { SyncError } from "./config.js";
import { assertAgentChanges, assertContext, assertUpstream } from "./guard.js";
import { digestDirectory } from "./git.js";
import { coverageErrors, parseAgentResult, parseReview } from "./review.js";
import { assertFullValidation, defaultValidationRuntime, fetchSchema, validateSample, type ValidationRuntime } from "./validate.js";
import { implementationSchema, reviewSchema } from "./tool-schemas.js";
import type { AgentResult, ReviewResult, SyncContext, Targets, ValidationResult } from "./types.js";

export interface ToolHost {
  repo: string; upstream: string; baseSha: string; sampleRoot: string; sourcePath: string; upstreamCommit: string; sourceTree: string;
  protectedPaths: string[]; excludes: string[]; contextRoot: string; contextDigest: string; context: SyncContext; configured: Targets;
  lastValidation?: ValidationResult; validationRuntime?: ValidationRuntime;
  onValidation?(result: ValidationResult): void;
  acceptImplementation(result: AgentResult): void; acceptReview(result: ReviewResult): void;
}
const queues = new WeakMap<ToolHost, Promise<unknown>>();
const schemas = new WeakMap<ToolHost, Map<string, Promise<unknown>>>();
const ajv = new Ajv({ allErrors: true, strict: false });
const implementationContract = ajv.compile(implementationSchema!);
const reviewContract = ajv.compile(reviewSchema!);

async function retryInfrastructure<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 2 || !/infrastructure failed|fetch failed|HTTP (?:429|5\d\d)|network|name resolution/i.test(message)) throw error;
      await delay(250 * (attempt + 1));
    }
  }
}

// All host tools share this queue. Built-in writes are also rejected while a
// validation is active by the adapter's before-tool hook.
const activeValidation = new WeakSet<ToolHost>();
export function validationInProgress(host: ToolHost): boolean { return activeValidation.has(host); }
function serialized<T>(host: ToolHost, operation: () => Promise<T> | T): Promise<T> {
  const result = (queues.get(host) ?? Promise.resolve()).then(operation);
  queues.set(host, result.catch(() => undefined));
  return result;
}
export function guardCandidate(host: ToolHost): string {
  assertAgentChanges(host.repo, host.baseSha, host.sampleRoot, host.protectedPaths);
  assertContext(host.contextRoot, host.contextDigest);
  assertUpstream(host.upstream, host.upstreamCommit, host.sourcePath, host.sourceTree);
  return digestDirectory(path.join(host.repo, host.sampleRoot), host.excludes);
}
async function cachedSchema(host: ToolHost, url: string): Promise<unknown> {
  const address = new URL(url);
  if (address.protocol !== "https:" || address.hostname !== "developer.microsoft.com" || !/^\/json-schemas\/teams\/v\d+\.\d+\/MicrosoftTeams\.schema\.json$/.test(address.pathname) || address.search || address.hash) throw new SyncError("Only released Teams schema queries are supported");
  let cache = schemas.get(host); if (!cache) { cache = new Map(); schemas.set(host, cache); }
  let pending = cache.get(url);
  if (!pending) {
    pending = retryInfrastructure(() => (host.validationRuntime?.loadSchema ?? fetchSchema)(url));
    cache.set(url, pending);
    void pending.catch(() => cache!.delete(url));
  }
  return pending;
}
export function validateTool(host: ToolHost, group: "code" | "manifest" | "all"): Promise<ValidationResult> {
  return serialized(host, async () => {
    if (!["code", "manifest", "all"].includes(group)) throw new SyncError("Unknown validation group");
    const before = guardCandidate(host); const target = host.configured.samples[host.context.sample];
    if (!target) throw new SyncError("Selected sample is not configured");
    activeValidation.add(host);
    try {
      const baseRuntime = host.validationRuntime ?? defaultValidationRuntime;
      const runtime: ValidationRuntime = { ...baseRuntime, loadSchema: (url: string) => cachedSchema(host, url),
        runCommand: (command, args, cwd) => retryInfrastructure(async () => baseRuntime.runCommand(command, args, cwd)) };
      const value = await validateSample(host.repo, host.context.sample, path.join(host.repo, host.sampleRoot), host.configured, target.manifest, host.excludes, runtime, group);
      const after = guardCandidate(host);
      if (before !== after || value.outputDigest !== after) throw new SyncError("Validation changed candidate source or returned a stale digest");
      host.lastValidation = value;
      host.onValidation?.(value);
      return value;
    } finally { activeValidation.delete(host); }
  });
}

type SchemaNode = Record<string, unknown>;
function node(value: unknown): SchemaNode | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as SchemaNode : undefined; }
function variants(value: unknown, root: unknown, seen = new Set<unknown>()): SchemaNode[] {
  const current = node(value);
  if (!current || seen.has(current)) return [];
  const visited = new Set(seen); visited.add(current);
  const result = [current];
  if (typeof current.$ref === "string") {
    if (!current.$ref.startsWith("#/")) throw new SyncError("Schema inspection supports local released-schema references only");
    let referenced = root;
    for (const part of current.$ref.slice(2).split("/")) referenced = node(referenced)?.[part.replaceAll("~1", "/").replaceAll("~0", "~")];
    if (referenced === undefined) throw new SyncError(`Unresolved released schema reference: ${current.$ref}`);
    result.push(...variants(referenced, root, visited));
  }
  for (const key of ["allOf", "oneOf", "anyOf"]) if (Array.isArray(current[key])) for (const item of current[key]) result.push(...variants(item, root, visited));
  return result;
}
/** Resolve concrete array positions and local references without fetching arbitrary URLs. */
export function schemaDefinition(schema: unknown, fieldPath: string): unknown[] {
  if (!/^[A-Za-z_$][A-Za-z0-9_$-]*(?:\.[A-Za-z_$][A-Za-z0-9_$-]*|\[\d+\])*$/.test(fieldPath)) throw new SyncError("Schema query must be a concrete manifest path");
  const tokens = [...fieldPath.matchAll(/(?:^|\.)([^.\[\]]+)|\[(\d+)\]/g)].map((match) => match[1] ?? Number(match[2]));
  let candidates: unknown[] = [schema];
  for (const token of tokens) {
    const next: unknown[] = [];
    for (const candidate of candidates) for (const variant of variants(candidate, schema)) {
      const child = typeof token === "number" ? (Array.isArray(variant.items) ? variant.items[token] : variant.items) : node(variant.properties)?.[token];
      if (child !== undefined) next.push(child);
    }
    candidates = next;
  }
  return [...new Set(candidates.flatMap((candidate) => variants(candidate, schema)))];
}
export function inspectManifestSchema(host: ToolHost, fieldPath: string): Promise<Record<string, unknown>> {
  return serialized(host, async () => {
    const before = guardCandidate(host);
    const manifestFile = path.join(host.repo, host.sampleRoot, host.context.manifest.packageDirectory, "manifest.json");
    if (!existsSync(manifestFile)) throw new SyncError("Manifest does not exist");
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as { $schema?: unknown; manifestVersion?: unknown };
    if (typeof manifest.$schema !== "string") throw new SyncError("Manifest has no released schema URL");
    const definitions = schemaDefinition(await cachedSchema(host, manifest.$schema), fieldPath);
    if (guardCandidate(host) !== before) throw new SyncError("Candidate changed during schema inspection");
    return { path: fieldPath, defined: definitions.length > 0, schemaUrl: manifest.$schema, schemaVersion: manifest.manifestVersion ?? "unknown", definitions, note: "Allowed schema fields are not necessarily required; conditional alternatives need source and manifest context." };
  });
}
export function submitResult(host: ToolHost, raw: unknown): Promise<AgentResult> {
  return serialized(host, () => {
    const digest = guardCandidate(host);
    if (!implementationContract(raw)) throw new SyncError(`Invalid implementation fields: ${ajv.errorsText(implementationContract.errors, { separator: "; " })}`);
    const result = parseAgentResult(raw, host.context.sample);
    if (["updated", "unchanged"].includes(result.status)) {
      const errors = coverageErrors(host.repo, host.context, result);
      if (errors.length) throw new SyncError(errors.join("\n"));
      if (!host.lastValidation) throw new SyncError("Completed submission requires validate_sample group all first");
      assertFullValidation(host.lastValidation, host.context.sample, path.join(host.repo, host.sampleRoot));
      if (host.lastValidation.outputDigest !== digest) throw new SyncError("Completed submission has stale validation; rerun validate_sample group all");
    }
    if (guardCandidate(host) !== digest) throw new SyncError("Candidate changed during implementation submission");
    host.acceptImplementation(result);
    return result;
  });
}
export function submitReview(host: ToolHost, raw: unknown, capabilityIds: string[], previousFindingIds: string[]): Promise<ReviewResult> {
  return serialized(host, () => {
    const digest = guardCandidate(host);
    if (!reviewContract(raw)) throw new SyncError(`Invalid review fields: ${ajv.errorsText(reviewContract.errors, { separator: "; " })}`);
    if (!host.lastValidation) throw new SyncError("Review requires current full validation");
    assertFullValidation(host.lastValidation, host.context.sample, path.join(host.repo, host.sampleRoot));
    if (host.lastValidation.outputDigest !== digest) throw new SyncError("Review candidate differs from current validation");
    const result = parseReview(raw, host.context.sample, host.context.changes.map((change) => change.id), capabilityIds, previousFindingIds);
    if (guardCandidate(host) !== digest) throw new SyncError("Candidate changed during review submission");
    host.acceptReview(result);
    return result;
  });
}
