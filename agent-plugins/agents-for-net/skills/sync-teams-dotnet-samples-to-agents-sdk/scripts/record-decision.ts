#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parse, stringify } from "yaml";

interface Decision extends Record<string, unknown> {
  id?: string;
  sample?: string;
  status?: string;
}

interface DecisionDocument extends Record<string, unknown> {
  decisions: Decision[];
}

interface RecordDecisionArgs {
  file: string;
  id: string;
  outcome: "approved" | "rejected";
  actor: string;
  pullRequest: string;
  statusOnly?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function recordDecision(args: RecordDecisionArgs): Decision {
  if (!existsSync(args.file)) throw new Error(`Decision file does not exist: ${args.file}`);
  const value = parse(readFileSync(args.file, "utf8")) as unknown;
  if (!isRecord(value) || !Array.isArray(value.decisions)) {
    throw new Error(`Expected decisions list in ${args.file}`);
  }
  const document = value as DecisionDocument;
  const matches = document.decisions.filter((item) => isRecord(item) && item.id === args.id);
  if (matches.length !== 1) {
    throw new Error(`Expected one proposed decision named ${args.id}, found ${matches.length}`);
  }
  const decision = matches[0]!;
  if (decision.status !== "proposed" && decision.status !== args.outcome) {
    throw new Error(`Decision ${args.id} is neither proposed nor ${args.outcome}`);
  }
  if (!isRecord(decision.proposal)) throw new Error(`Decision ${args.id} has no proposal metadata`);
  decision.status = args.outcome;
  if (!args.statusOnly) {
    decision.authority = "human";
    decision.decidedBy = args.actor;
    decision.decidedIn = `PR-${args.pullRequest}`;
    delete decision.approvedBy;
    delete decision.approvedIn;
  }
  writeFileSync(args.file, stringify(document, { lineWidth: 0 }), "utf8");
  return decision;
}

function parseArguments(argv: string[], invocationRoot: string): RecordDecisionArgs {
  const values: Record<string, string> = {};
  let statusOnly = false;
  for (let index = 0; index < argv.length;) {
    const option = argv[index];
    if (option === "--status-only") {
      statusOnly = true;
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (!option?.startsWith("--") || !value) throw new Error(`Invalid argument: ${String(option)}`);
    values[option.slice(2)] = value;
    index += 2;
  }
  for (const name of ["file", "id", "outcome", "actor", "pull-request"]) {
    if (!values[name]) throw new Error(`Missing required option: --${name}`);
  }
  const outcome = values.outcome;
  if (outcome !== "approved" && outcome !== "rejected") {
    throw new Error("--outcome must be approved or rejected");
  }
  return {
    file: path.resolve(invocationRoot, values.file!),
    id: values.id!,
    outcome,
    actor: values.actor!,
    pullRequest: values["pull-request"]!,
    statusOnly,
  };
}

export function main(argv = process.argv.slice(2)): number {
  try {
    const invocationRoot = process.env.INIT_CWD ?? process.cwd();
    const decision = recordDecision(parseArguments(argv, invocationRoot));
    process.stdout.write(`${JSON.stringify({ id: decision.id, sample: decision.sample })}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: errorMessage(error) })}\n`);
    return 2;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) process.exitCode = main();
