#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createContext } from "./context.js";
import { protection, targets, SyncError } from "./config.js";
import { attempts, CopilotAgentRunner, runAgentLoop } from "./agent-runner.js";
import { changedPaths, digestDirectory, git, hash, matches, stable } from "./git.js";
import { createPlan } from "./plan.js";
import { prBody, workflowSummary } from "./report.js";
import { createState, statePath, validateState } from "./state.js";
import { prepareManifest, validateSample } from "./validate.js";
import type { Plan, State, SyncContext, SyncResult } from "./types.js";

function parseArgs(items: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < items.length; index += 2) {
    const option = items[index]; const value = items[index + 1];
    if (!option?.startsWith("--") || !value || value.startsWith("--")) throw new SyncError(`Invalid argument: ${String(option)}`);
    const key = option.slice(2);
    if (key in result) throw new SyncError(`Duplicate option: ${option}`);
    result[key] = value;
  }
  return result;
}

function required(values: Record<string, string>, name: string): string {
  const value = values[name];
  if (!value) throw new SyncError(`Missing required option: --${name}`);
  return value;
}

function readJson<T>(file: string): T {
  try { return JSON.parse(readFileSync(file, "utf8")) as T; }
  catch (error) { throw new SyncError(`Cannot read JSON ${file}: ${error instanceof Error ? error.message : String(error)}`); }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveOption(value: string): string { return path.resolve(process.env.INIT_CWD ?? process.cwd(), value); }

async function migrate(repo: string, values: Record<string, string>): Promise<number> {
  const upstream = resolveOption(required(values, "upstream-root"));
  const plan = readJson<Plan>(resolveOption(required(values, "plan")));
  const sample = required(values, "sample");
  const output = resolveOption(required(values, "output-directory"));
  mkdirSync(output, { recursive: true });
  const configured = targets(repo);
  const owner = protection(repo);
  const target = configured.samples[sample];
  const entry = plan.samples[sample];
  if (plan.version !== 2 || !target || !entry?.upstreamCommit || !entry.sourceTree || !entry.inputDigest || !entry.componentDigests || entry.status !== "pending") {
    throw new SyncError("Plan does not contain a pending selected sample");
  }
  const baseSha = git(repo, ["rev-parse", "HEAD"]) as string;
  const sampleRelative = `${configured.destinationRoot}/${target.destination}`.replaceAll("\\", "/");
  const sampleRoot = path.join(repo, sampleRelative);
  const context = createContext(repo, upstream, plan, sample);
  const contextValue = readJson<SyncContext>(context.file);
  prepareManifest(sampleRoot, path.join(repo, configured.canonicalSample), target.manifest);
  const agentLog = path.join(output, "agent-log.txt");
  writeFileSync(agentLog, "", "utf8");
  const runner = new CopilotAgentRunner(repo, path.join(repo, ".sync", "runner", sample), agentLog);

  let syncResult: SyncResult;
  try {
    const loop = await runAgentLoop({
      repo,
      upstream,
      baseSha,
      sample,
      sampleRoot: sampleRelative,
      sourcePath: `${configured.upstream.root}/${target.source}`,
      upstreamCommit: entry.upstreamCommit,
      sourceTree: entry.sourceTree,
      protectedPaths: owner.protectedPaths,
      outputDigestExcludes: owner.outputDigestExcludes,
      policyKeys: contextValue.policies.map((policy) => policy.key),
      context,
      maxAttempts: attempts(values["max-attempts"] ? Number(values["max-attempts"]) : undefined),
      runner,
      validate: () => validateSample(repo, sample, sampleRoot, configured, target.manifest, owner.outputDigestExcludes),
    });
    writeJson(path.join(output, "agent-result.json"), loop.agent);
    writeJson(path.join(output, "validation.json"), loop.validation);
    if (loop.agent.status === "needs-policy" || loop.agent.status === "unsupported") {
      syncResult = {
        version: 2, sample, status: loop.agent.status, publishable: false, baseSha,
        previousUpstreamCommit: contextValue.upstream.previousCommit,
        upstreamCommit: entry.upstreamCommit, upstreamChanges: contextValue.upstream.changes,
        changedComponents: entry.changedComponents, migrationPolicies: contextValue.policies,
        sourceTree: entry.sourceTree, inputDigest: entry.inputDigest,
        componentDigests: entry.componentDigests, outputDigest: loop.validation.outputDigest,
        agent: loop.agent, validation: loop.validation,
      };
    } else if (!loop.validation.passed) {
      syncResult = {
        version: 2, sample, status: "failed", publishable: false, baseSha,
        previousUpstreamCommit: contextValue.upstream.previousCommit,
        upstreamCommit: entry.upstreamCommit, upstreamChanges: contextValue.upstream.changes,
        changedComponents: entry.changedComponents, migrationPolicies: contextValue.policies,
        sourceTree: entry.sourceTree, inputDigest: entry.inputDigest,
        componentDigests: entry.componentDigests, outputDigest: loop.validation.outputDigest,
        agent: loop.agent, validation: loop.validation, error: loop.validation.errors.join("\n"),
      };
    } else {
      const state = createState(sample, entry, loop.validation);
      const lock = statePath(repo, sample);
      writeJson(lock, state);
      git(repo, ["add", "-N", "--", sampleRelative, path.relative(repo, lock).replaceAll("\\", "/")]);
      const patch = git(repo, ["diff", "--binary", baseSha, "--", sampleRelative, path.relative(repo, lock).replaceAll("\\", "/")], true) as Buffer;
      if (patch.length === 0) throw new SyncError("Validated migration produced no sample or state patch");
      writeFileSync(path.join(output, "change.patch"), patch);
      writeJson(path.join(output, "final-state.json"), state);
      const destinationChanges = changedPaths(repo, baseSha).filter((item) =>
        item === path.relative(repo, lock).replaceAll("\\", "/") || item.startsWith(`${sampleRelative}/`));
      syncResult = {
        version: 2, sample, status: "updated", publishable: true, baseSha,
        previousUpstreamCommit: contextValue.upstream.previousCommit,
        upstreamCommit: entry.upstreamCommit, upstreamChanges: contextValue.upstream.changes,
        changedComponents: entry.changedComponents, migrationPolicies: contextValue.policies, destinationChanges,
        sourceTree: entry.sourceTree, inputDigest: entry.inputDigest,
        componentDigests: entry.componentDigests, outputDigest: loop.validation.outputDigest,
        state, agent: loop.agent, validation: loop.validation,
      };
    }
  } catch (error) {
    syncResult = {
      version: 2, sample, status: "failed", publishable: false, baseSha,
      previousUpstreamCommit: contextValue.upstream.previousCommit,
      upstreamCommit: entry.upstreamCommit, upstreamChanges: contextValue.upstream.changes,
      changedComponents: entry.changedComponents, migrationPolicies: contextValue.policies,
      sourceTree: entry.sourceTree, inputDigest: entry.inputDigest,
      componentDigests: entry.componentDigests,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  writeJson(path.join(output, "sync-result.json"), syncResult);
  writeFileSync(path.join(output, "pr-body.md"), prBody(syncResult), "utf8");
  writeFileSync(path.join(output, "workflow-summary.md"), workflowSummary(syncResult), "utf8");
  return syncResult.status === "failed" ? 1 : 0;
}

function verifyPatch(repo: string, values: Record<string, string>): void {
  const sample = required(values, "sample");
  const resultFile = resolveOption(required(values, "result"));
  const result = readJson<SyncResult>(resultFile);
  if (result.version !== 2 || result.sample !== sample || result.status !== "updated" || !result.publishable ||
      !result.state || !result.outputDigest || !result.validation?.passed ||
      result.validation.outputDigest !== result.outputDigest ||
      !result.agent || !["updated", "unchanged"].includes(result.agent.status)) {
    throw new SyncError("Only a complete updated result is publishable");
  }
  const head = git(repo, ["rev-parse", "HEAD"]) as string;
  if (head !== result.baseSha) throw new SyncError("Publish checkout differs from validated base SHA");
  const configured = targets(repo); const owner = protection(repo); const target = configured.samples[sample];
  if (!target) throw new SyncError("Sample is not selected");
  const sampleRelative = `${configured.destinationRoot}/${target.destination}`.replaceAll("\\", "/");
  const stateRelative = path.relative(repo, statePath(repo, sample)).replaceAll("\\", "/");
  const changed = changedPaths(repo, head);
  if (changed.length === 0) throw new SyncError("Applied patch has no changes");
  if (!result.destinationChanges || stable(result.destinationChanges) !== stable(changed)) {
    throw new SyncError("Applied paths differ from validated result");
  }
  const reportedPolicyKeys = result.migrationPolicies.map((policy) => policy.key).sort();
  const appliedPolicyKeys = [...result.agent.appliedPolicies].sort();
  if (stable(reportedPolicyKeys) !== stable(appliedPolicyKeys)) {
    throw new SyncError("Reported policies differ from the validated agent result");
  }
  for (const item of changed) {
    if (item === "manifest-evidence.md" || item.endsWith("/manifest-evidence.md") || matches(item, owner.protectedPaths)) {
      throw new SyncError(`Patch changes prohibited path: ${item}`);
    }
    if (item !== stateRelative && !item.startsWith(`${sampleRelative}/`)) throw new SyncError(`Patch changes path outside result: ${item}`);
  }
  const patchFile = path.join(path.dirname(resultFile), "change.patch");
  if (!existsSync(patchFile)) throw new SyncError("Result patch is missing");
  git(repo, ["apply", "--check", "--reverse", "--binary", patchFile]);
  const outputDigest = digestDirectory(path.join(repo, sampleRelative), owner.outputDigestExcludes);
  if (outputDigest !== result.outputDigest) throw new SyncError("Applied sample output digest differs from validated result");
  const state = readJson<State>(path.join(repo, stateRelative));
  validateState(state, sample);
  if (stable(state) !== stable(result.state) || state.outputDigest !== outputDigest ||
      state.upstreamCommit !== result.upstreamCommit || state.sourceTree !== result.sourceTree ||
      state.inputDigest !== result.inputDigest || hash(stable(state.componentDigests)) !== hash(stable(result.componentDigests))) {
    throw new SyncError("Applied state differs from validated result");
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const [command, ...rest] = argv;
    if (command !== "plan" && command !== "migrate" && command !== "verify-patch") {
      throw new SyncError("Expected command: plan, migrate, or verify-patch");
    }
    const values = parseArgs(rest);
    const repo = path.resolve(process.env.INIT_CWD ?? process.cwd(), values["repo-root"] ?? ".");
    if (command === "plan") {
      const output = resolveOption(required(values, "output"));
      writeJson(output, createPlan(repo, resolveOption(required(values, "upstream-root")), values.sample));
      return 0;
    }
    if (command === "migrate") return await migrate(repo, values);
    verifyPatch(repo, values);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entry && import.meta.url === pathToFileURL(entry).href) process.exitCode = await main();
