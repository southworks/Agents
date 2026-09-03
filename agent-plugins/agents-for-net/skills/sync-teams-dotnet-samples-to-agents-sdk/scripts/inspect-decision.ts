#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

import { CONFIG_DIRECTORY, SyncError, canonicalJson, directoryDigest, loadYaml } from "./sync.js";

type Data = Record<string, unknown>;

interface InspectArgs {
  repoRoot: string;
  configDir?: string;
  baseRef?: string;
  id?: string;
  outcome?: "approved" | "rejected";
  output?: string;
}

function isRecord(value: unknown): value is Data {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runGit(repository: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new SyncError(String(result.stderr || result.stdout || "Git command failed").trim());
  }
  return String(result.stdout).trim();
}

function parseDecisionDocument(value: string, description: string): Data[] {
  const document = parse(value) as unknown;
  if (!isRecord(document) || !Array.isArray(document.decisions)) {
    throw new SyncError(`Expected decisions list in ${description}`);
  }
  return document.decisions.map((item, index) => {
    if (!isRecord(item)) throw new SyncError(`Invalid decision at index ${index} in ${description}`);
    return item;
  });
}

function digestFile(filePath: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
}

export function inspectDecisionTransition(args: InspectArgs): Data {
  const repositoryRoot = path.resolve(args.repoRoot);
  const configDir = args.configDir ?? CONFIG_DIRECTORY;
  const decisionsRelative = path.posix.join(configDir.replaceAll("\\", "/"), "decisions.yml");
  const baseRef = args.baseRef ?? "HEAD^";
  const changedPaths = runGit(repositoryRoot, ["diff", "--name-only", baseRef, "HEAD"])
    .split(/\r?\n/)
    .filter(Boolean);
  if (changedPaths.length !== 1 || changedPaths[0] !== decisionsRelative) {
    throw new SyncError(`Decision commit must change only ${decisionsRelative}`);
  }

  const before = parseDecisionDocument(
    runGit(repositoryRoot, ["show", `${baseRef}:${decisionsRelative}`]),
    `${decisionsRelative} at ${baseRef}`,
  );
  const after = parseDecisionDocument(
    readFileSync(path.join(repositoryRoot, decisionsRelative), "utf8"),
    decisionsRelative,
  );
  const beforeById = new Map(before.map((item) => [String(item.id ?? ""), item]));
  const afterById = new Map(after.map((item) => [String(item.id ?? ""), item]));
  if (beforeById.size !== before.length || afterById.size !== after.length) {
    throw new SyncError("Decision IDs must be present and unique");
  }
  const changedIds = [...new Set([...beforeById.keys(), ...afterById.keys()])].filter(
    (id) => canonicalJson(beforeById.get(id)) !== canonicalJson(afterById.get(id)),
  );
  if (changedIds.length !== 1) throw new SyncError(`Expected one decision change, found ${changedIds.length}`);
  const id = changedIds[0]!;
  if (args.id && args.id !== id) throw new SyncError(`Decision changed was ${id}, expected ${args.id}`);
  const previous = beforeById.get(id);
  const current = afterById.get(id);
  if (!previous || !current || previous.status !== "proposed") {
    throw new SyncError(`${id} is not a proposed-to-resolved transition`);
  }
  if (current.status !== "approved" && current.status !== "rejected") {
    throw new SyncError(`${id} must change to approved or rejected`);
  }
  if (args.outcome && current.status !== args.outcome) {
    throw new SyncError(`${id} changed to ${String(current.status)}, expected ${args.outcome}`);
  }
  const normalized = { ...current, status: "proposed" };
  if (canonicalJson(previous) !== canonicalJson(normalized)) {
    throw new SyncError(`${id} transition changed fields other than status`);
  }
  if (!isRecord(current.proposal)) throw new SyncError(`${id} has no proposal metadata`);
  const proposal = current.proposal;
  for (const field of [
    "upstreamCommit",
    "sourceTree",
    "proposalInputDigest",
    "baseOutputDigest",
    "candidateOutputDigest",
    "patchDigest",
    "patchPath",
  ]) {
    if (typeof proposal[field] !== "string" || proposal[field] === "") {
      throw new SyncError(`${id} proposal is missing ${field}`);
    }
  }
  const patchRelative = String(proposal.patchPath);
  const expectedPatchRelative = path.posix.join(
    configDir.replaceAll("\\", "/"),
    "proposals",
    `${id}.patch`,
  );
  if (patchRelative !== expectedPatchRelative) {
    throw new SyncError(`${id} proposal patch path must be ${expectedPatchRelative}`);
  }
  const patchPath = path.join(repositoryRoot, patchRelative);
  if (!existsSync(patchPath) || digestFile(patchPath) !== proposal.patchDigest) {
    throw new SyncError(`${id} proposal patch is missing or has the wrong digest`);
  }

  const targets = loadYaml(path.join(repositoryRoot, configDir, "targets.yml"));
  const ownership = loadYaml(path.join(repositoryRoot, configDir, "ownership.yml"));
  const samples = isRecord(targets.samples) ? targets.samples : {};
  const sample = String(current.sample ?? "");
  const target = samples[sample];
  if (!isRecord(target) || typeof target.destination !== "string" || typeof targets.destinationRoot !== "string") {
    throw new SyncError(`${id} does not select a configured sample`);
  }
  const sampleRelative = path.posix.join(
    String(targets.destinationRoot).replaceAll("\\", "/"),
    target.destination.replaceAll("\\", "/"),
  );
  const patchText = readFileSync(patchPath, "utf8");
  const headers = [...patchText.matchAll(/^diff --git a\/([^\s]+) b\/([^\s]+)$/gm)];
  if (headers.length === 0) throw new SyncError(`${id} proposal patch has no unambiguous file entries`);
  for (const header of headers) {
    for (const changedPath of [header[1], header[2]]) {
      if (!changedPath?.startsWith(`${sampleRelative}/`)) {
        throw new SyncError(`${id} proposal patch targets unauthorized path: ${String(changedPath)}`);
      }
    }
  }
  runGit(repositoryRoot, ["apply", "--check", "--reverse", "--binary", patchRelative]);
  const sampleRoot = path.join(repositoryRoot, targets.destinationRoot, target.destination);
  const excludes = Array.isArray(ownership.outputDigestExcludes)
    ? ownership.outputDigestExcludes.filter((item): item is string => typeof item === "string")
    : [];
  const currentDigest = directoryDigest(sampleRoot, excludes);
  if (currentDigest !== proposal.candidateOutputDigest) {
    throw new SyncError(`${id} tentative sample output changed after proposal creation`);
  }
  const unresolvedForSample = after.filter(
    (item) => (item.sample === sample || item.sample === "*") && item.status === "proposed",
  );
  if (unresolvedForSample.length > 0) throw new SyncError(`${sample} still has an unresolved decision`);

  return {
    version: 1,
    id,
    sample,
    outcome: current.status,
    proposal,
    baseRef,
    headSha: runGit(repositoryRoot, ["rev-parse", "HEAD"]),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseArguments(argv: string[], invocationRoot: string): InspectArgs {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option?.startsWith("--") || !value) throw new SyncError(`Invalid argument: ${String(option)}`);
    values[option.slice(2)] = value;
  }
  if (!values["repo-root"]) throw new SyncError("Missing required option: --repo-root");
  if (values.outcome && values.outcome !== "approved" && values.outcome !== "rejected") {
    throw new SyncError("--outcome must be approved or rejected");
  }
  return {
    repoRoot: path.resolve(invocationRoot, values["repo-root"]),
    ...(values["config-dir"] ? { configDir: values["config-dir"] } : {}),
    ...(values["base-ref"] ? { baseRef: values["base-ref"] } : {}),
    ...(values.id ? { id: values.id } : {}),
    ...(values.outcome ? { outcome: values.outcome as "approved" | "rejected" } : {}),
    ...(values.output ? { output: path.resolve(invocationRoot, values.output) } : {}),
  };
}

export function main(argv = process.argv.slice(2)): number {
  try {
    const invocationRoot = process.env.INIT_CWD ?? process.cwd();
    const args = parseArguments(argv, invocationRoot);
    const result = inspectDecisionTransition(args);
    const rendered = `${JSON.stringify(result, null, 2)}\n`;
    if (args.output) writeFileSync(args.output, rendered, "utf8");
    else process.stdout.write(rendered);
    return 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: errorMessage(error) })}\n`);
    return 2;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) process.exitCode = main();
