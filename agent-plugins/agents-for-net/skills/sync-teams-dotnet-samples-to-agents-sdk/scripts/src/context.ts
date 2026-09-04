import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { protection, targets, SyncError } from "./config.js";
import { digestDirectory, git, materializeTree, tree, upstreamChanges } from "./git.js";
import { applicablePolicies } from "./policy.js";
import { readPriorState } from "./state.js";
import type { Plan, SyncContext } from "./types.js";

export interface ContextFiles { root: string; file: string; digest: string }

function lockTree(root: string): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) lockTree(item);
    else chmodSync(item, 0o444);
  }
  chmodSync(root, 0o555);
}

function unlockTree(root: string): void {
  if (!existsSync(root)) return;
  chmodSync(root, 0o755);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) unlockTree(item);
    else chmodSync(item, 0o644);
  }
}

export function createContext(repo: string, upstream: string, plan: Plan, sample: string): ContextFiles {
  const configured = targets(repo);
  const entry = plan.samples[sample];
  const target = configured.samples[sample];
  if (!target || !entry?.upstreamCommit || !entry.sourceTree || entry.status !== "pending") {
    throw new SyncError("Plan does not contain a pending selected sample");
  }
  const upstreamHead = git(upstream, ["rev-parse", "HEAD"]) as string;
  if (upstreamHead !== plan.upstreamCommit || upstreamHead !== entry.upstreamCommit) {
    throw new SyncError("Upstream HEAD differs from planned commit");
  }
  const sourcePath = `${configured.upstream.root}/${target.source}`;
  if (tree(upstream, upstreamHead, sourcePath) !== entry.sourceTree) throw new SyncError("Planned upstream source tree changed");

  const previousState = readPriorState(repo, sample);
  const previousCommit = previousState?.upstreamCommit ?? null;
  if (previousCommit) git(upstream, ["cat-file", "-e", `${previousCommit}^{commit}`]);
  const previousTree = previousCommit ? tree(upstream, previousCommit, sourcePath) ?? null : null;
  const root = path.join(repo, ".sync", "context");
  rmSync(root, { recursive: true, force: true });
  const previousRoot = path.join(root, "previous-upstream");
  mkdirSync(previousRoot, { recursive: true });
  if (previousCommit && previousTree) materializeTree(upstream, previousCommit, sourcePath, previousRoot);

  const context: SyncContext = {
    version: 1,
    sample,
    upstream: {
      repository: configured.upstream.repository,
      sourcePath,
      previousCommit,
      currentCommit: entry.upstreamCommit,
      previousTree,
      currentTree: entry.sourceTree,
      initialImport: previousCommit === null,
      changes: previousCommit ? upstreamChanges(upstream, previousCommit, entry.upstreamCommit, sourcePath) : [],
    },
    paths: {
      previousUpstream: ".sync/context/previous-upstream",
      currentUpstream: path.relative(repo, path.join(upstream, sourcePath)).replaceAll("\\", "/"),
      destination: `${configured.destinationRoot}/${target.destination}`,
    },
    migration: {
      targetFramework: configured.packagePolicy.targetFramework,
      agentsSdkVersion: configured.packagePolicy.agentsSdkVersion,
      canonicalSample: configured.canonicalSample,
    },
    manifest: target.manifest,
    policies: applicablePolicies(repo, configured, sample),
    protectedPaths: protection(repo).protectedPaths,
  };
  const file = path.join(root, "sync-context.json");
  writeFileSync(file, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  lockTree(root);
  return { root, file, digest: digestDirectory(root) };
}

export function updateContextErrors(context: ContextFiles, errors: string[]): ContextFiles {
  unlockTree(context.root);
  const value = JSON.parse(readFileSync(context.file, "utf8")) as SyncContext;
  value.validationErrors = [...errors];
  writeFileSync(context.file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  lockTree(context.root);
  return { ...context, digest: digestDirectory(context.root) };
}
