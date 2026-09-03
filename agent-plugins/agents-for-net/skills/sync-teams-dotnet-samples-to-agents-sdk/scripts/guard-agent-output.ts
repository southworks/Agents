#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

import { CONFIG_DIRECTORY, SyncError, canonicalJson } from "./sync.js";

type Data = Record<string, unknown>;

interface GuardArgs {
  repoRoot: string;
  sample: string;
  mode: "initial" | "stable";
  baseRef: string;
}

function isRecord(value: unknown): value is Data {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function gitBuffer(repository: string, args: string[]): Buffer {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "buffer" });
  if (result.status !== 0) {
    throw new SyncError(Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8").trim() : "Git failed");
  }
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0);
}

function nulPaths(repository: string, args: string[]): string[] {
  return gitBuffer(repository, args)
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function yamlRecord(value: string, description: string): Data {
  const parsed = parse(value) as unknown;
  if (!isRecord(parsed)) throw new SyncError(`Expected YAML mapping in ${description}`);
  return parsed;
}

function decisions(document: Data, description: string): Data[] {
  if (!Array.isArray(document.decisions)) throw new SyncError(`Expected decisions in ${description}`);
  return document.decisions.map((item) => {
    if (!isRecord(item)) throw new SyncError(`Invalid decision in ${description}`);
    return item;
  });
}

export function guardAgentOutput(args: GuardArgs): Data {
  const repositoryRoot = path.resolve(args.repoRoot);
  const currentHead = gitBuffer(repositoryRoot, ["rev-parse", "HEAD"]).toString("utf8").trim();
  const expectedHead = gitBuffer(repositoryRoot, ["rev-parse", args.baseRef]).toString("utf8").trim();
  if (currentHead !== expectedHead) {
    throw new SyncError("Agent changed HEAD");
  }
  const targetsPath = `${CONFIG_DIRECTORY}/targets.yml`;
  const targets = yamlRecord(
    gitBuffer(repositoryRoot, ["show", `${args.baseRef}:${targetsPath}`]).toString("utf8"),
    `${targetsPath} at ${args.baseRef}`,
  );
  const samples = isRecord(targets.samples) ? targets.samples : {};
  const target = samples[args.sample];
  if (!isRecord(target) || typeof target.destination !== "string" || typeof targets.destinationRoot !== "string") {
    throw new SyncError(`Sample is not selected at HEAD: ${args.sample}`);
  }
  const samplePrefix = `${path.posix.join(targets.destinationRoot, target.destination).replaceAll("\\", "/")}/`;
  const decisionsPath = `${CONFIG_DIRECTORY}/decisions.yml`;
  const changed = new Set([
    ...nulPaths(repositoryRoot, ["diff", "--name-only", "-z", args.baseRef]),
    ...nulPaths(repositoryRoot, ["diff", "--cached", "--name-only", "-z", args.baseRef]),
    ...nulPaths(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const unauthorized = [...changed].filter((item) => {
    const normalized = item.replaceAll("\\", "/");
    return !normalized.startsWith(samplePrefix) && normalized !== decisionsPath && !normalized.startsWith(".sync/");
  });
  if (unauthorized.length > 0) {
    throw new SyncError(`Agent changed unauthorized paths: ${unauthorized.sort().join(", ")}`);
  }

  const before = decisions(yamlRecord(
    gitBuffer(repositoryRoot, ["show", `${args.baseRef}:${decisionsPath}`]).toString("utf8"),
    `${decisionsPath} at ${args.baseRef}`,
  ), "HEAD decisions");
  const after = decisions(yamlRecord(
    readFileSync(path.join(repositoryRoot, decisionsPath), "utf8"),
    decisionsPath,
  ), "working decisions");
  if (args.mode === "stable") {
    if (canonicalJson(before) !== canonicalJson(after)) {
      throw new SyncError("Agent changed decisions during a stable pass");
    }
    return { version: 1, sample: args.sample, proposedDecisionIds: [] };
  }

  const beforeById = new Map(before.map((item) => [String(item.id ?? ""), item]));
  const afterById = new Map(after.map((item) => [String(item.id ?? ""), item]));
  if (beforeById.size !== before.length || afterById.size !== after.length) {
    throw new SyncError("Decision IDs must be present and unique");
  }
  for (const [id, prior] of beforeById) {
    if (canonicalJson(prior) !== canonicalJson(afterById.get(id))) {
      throw new SyncError(`Agent modified existing decision ${id}`);
    }
  }
  const added = after.filter((item) => !beforeById.has(String(item.id ?? "")));
  if (added.length > 1) throw new SyncError("Agent added more than one decision");
  if (added.length === 1) {
    const decision = added[0]!;
    if (
      !/^DEC-[0-9]+$/.test(String(decision.id ?? "")) ||
      decision.sample !== args.sample ||
      decision.status !== "proposed" ||
      decision.proposal !== undefined
    ) {
      throw new SyncError("Agent added an invalid proposed decision");
    }
    for (const field of ["question", "recommendation", "evidence", "impact", "invalidatesOn"]) {
      if (typeof decision[field] !== "string" || decision[field] === "") {
        throw new SyncError(`Proposed decision is missing ${field}`);
      }
    }
  }
  return {
    version: 1,
    sample: args.sample,
    proposedDecisionIds: added.map((item) => item.id),
  };
}

function parseArguments(argv: string[], invocationRoot: string): GuardArgs {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option?.startsWith("--") || !value) throw new SyncError(`Invalid argument: ${String(option)}`);
    values[option.slice(2)] = value;
  }
  if (!values["repo-root"] || !values.sample || !values.mode || !values["base-ref"]) {
    throw new SyncError("Missing guard option");
  }
  if (values.mode !== "initial" && values.mode !== "stable") {
    throw new SyncError("--mode must be initial or stable");
  }
  return {
    repoRoot: path.resolve(invocationRoot, values["repo-root"]),
    sample: values.sample,
    mode: values.mode,
    baseRef: values["base-ref"],
  };
}

export function main(argv = process.argv.slice(2)): number {
  try {
    const result = guardAgentOutput(parseArguments(argv, process.env.INIT_CWD ?? process.cwd()));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
    return 2;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) process.exitCode = main();
