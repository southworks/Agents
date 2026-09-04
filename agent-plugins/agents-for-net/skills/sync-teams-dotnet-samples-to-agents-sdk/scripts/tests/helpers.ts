import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function write(file: string, value: string | Buffer): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value);
}

export function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

export function gitBuffer(root: string, ...args: string[]): Buffer {
  return execFileSync("git", ["-C", root, ...args], { encoding: "buffer" });
}

function init(root: string): void {
  mkdirSync(root, { recursive: true });
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "sync-test@example.com");
  git(root, "config", "user.name", "Sync Test");
}

export function commit(root: string, message: string): string {
  git(root, "add", ".");
  git(root, "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

export interface Fixture { root: string; repo: string; upstream: string; firstUpstreamCommit: string }

export function fixture(): Fixture {
  const root = mkdtempSync(path.join(tmpdir(), "teams-sync-"));
  const repo = path.join(root, "agents");
  const upstream = path.join(root, "upstream");
  init(repo); init(upstream);
  write(path.join(repo, ".github/teams-sample-sync/targets.yml"), `version: 1
upstream:
  repository: OfficeDev/Microsoft-Teams-Samples
  ref: main
  root: samples/TeamsSDK
destinationRoot: samples/dotnet/teams
canonicalSample: samples/dotnet/quickstart
migrationSkill: skills/migration
manifestSkill: skills/manifest
packagePolicy:
  targetFramework: net8.0
  agentsSdkVersion: "1.7.*"
validatorVersion: "1"
samples:
  sample-a:
    source: sample-a/dotnet/sample-a
    destination: sample-a
    manifest:
      distribution: sample
      packageDirectory: appManifest
      placeholderConvention: double-braces
`);
  write(path.join(repo, ".github/teams-sample-sync/migration-policy.yml"), "version: 1\npolicies: []\n");
  write(path.join(repo, ".github/teams-sample-sync/ownership.yml"), "version: 1\nprotectedPaths:\n  - manifest-evidence.md\n  - '**/manifest-evidence.md'\noutputDigestExcludes:\n  - bin/**\n  - obj/**\n");
  write(path.join(repo, ".github/teams-sample-sync/agent-prompt.md"), "Read CONTEXT_FILE and return JSON only.\n");
  write(path.join(repo, "skills/migration/SKILL.md"), "migration v1\n");
  write(path.join(repo, "skills/manifest/SKILL.md"), "manifest v1\n");
  write(path.join(repo, "samples/dotnet/quickstart/appManifest/color.png"), Buffer.from([1, 2]));
  write(path.join(repo, "samples/dotnet/quickstart/appManifest/outline.png"), Buffer.from([3, 4]));
  write(path.join(repo, "samples/dotnet/teams/sample-a/value.txt"), "destination\n");
  commit(repo, "fixture");
  write(path.join(upstream, "samples/TeamsSDK/sample-a/dotnet/sample-a/old.txt"), "old upstream\n");
  write(path.join(upstream, "samples/TeamsSDK/new-candidate/readme.md"), "candidate\n");
  const firstUpstreamCommit = commit(upstream, "upstream one");
  return { root, repo, upstream, firstUpstreamCommit };
}

export const componentDigests = {
  sourceTree: "tree", target: "target", policies: "policies", protection: "protection",
  migrationSkill: "migration", manifestSkill: "manifest", canonicalSample: "canonical",
  packagePolicy: "package", validator: "validator",
};
