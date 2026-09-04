import assert from "node:assert/strict";
import { chmodSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createContext } from "../src/context.js";
import { assertAgentChanges, assertContext, assertUpstream } from "../src/guard.js";
import { createPlan } from "../src/plan.js";
import { statePath } from "../src/state.js";
import type { SyncContext } from "../src/types.js";
import { commit, componentDigests, fixture, git, write } from "./helpers.js";

test("three-way context materializes prior bytes and records rename and binary changes", () => {
  const item = fixture();
  write(statePath(item.repo, "sample-a"), `${JSON.stringify({
    version: 2, sample: "sample-a", upstreamCommit: item.firstUpstreamCommit, sourceTree: "old-tree",
    inputDigest: "old-input", outputDigest: "old-output", componentDigests, status: "verified",
  })}\n`);
  git(item.upstream, "mv", "samples/TeamsSDK/sample-a/dotnet/sample-a/old.txt", "samples/TeamsSDK/sample-a/dotnet/sample-a/new.txt");
  write(path.join(item.upstream, "samples/TeamsSDK/sample-a/dotnet/sample-a/image.bin"), Buffer.from([0, 1, 2]));
  commit(item.upstream, "upstream two");
  const plan = createPlan(item.repo, item.upstream, "sample-a");
  const files = createContext(item.repo, item.upstream, plan, "sample-a");
  const context = JSON.parse(readFileSync(files.file, "utf8")) as SyncContext;
  assert.equal(readFileSync(path.join(files.root, "previous-upstream/old.txt"), "utf8"), "old upstream\n");
  assert.ok(context.upstream.changes.some((change) => change.status === "renamed" && change.oldPath === "old.txt" && change.newPath === "new.txt"));
  assert.ok(context.upstream.changes.some((change) => change.status === "added" && change.newPath === "image.bin" && change.binary));
  assertContext(files.root, files.digest);
  chmodSync(files.file, 0o644);
  write(files.file, `${readFileSync(files.file, "utf8")} `);
  assert.throws(() => assertContext(files.root, files.digest), /changed protected context/);
});

test("guards allow only the selected sample and verify immutable upstream", () => {
  const item = fixture();
  const base = git(item.repo, "rev-parse", "HEAD");
  write(path.join(item.repo, "samples/dotnet/teams/sample-a/allowed.txt"), "ok\n");
  assertAgentChanges(item.repo, base, "samples/dotnet/teams/sample-a", ["**/manifest-evidence.md"]);
  write(path.join(item.repo, "outside.txt"), "bad\n");
  assert.throws(() => assertAgentChanges(item.repo, base, "samples/dotnet/teams/sample-a", []), /outside selected sample/);
  rmSync(path.join(item.repo, "outside.txt"));
  write(path.join(item.repo, "samples/dotnet/teams/sample-a/manifest-evidence.md"), "bad\n");
  assert.throws(() => assertAgentChanges(item.repo, base, "samples/dotnet/teams/sample-a", ["**/manifest-evidence.md"]), /protected path/);
  const commitId = git(item.upstream, "rev-parse", "HEAD");
  const sourceTree = git(item.upstream, "rev-parse", `${commitId}:samples/TeamsSDK/sample-a/dotnet/sample-a`);
  assertUpstream(item.upstream, commitId, "samples/TeamsSDK/sample-a/dotnet/sample-a", sourceTree);
  write(path.join(item.upstream, "untracked.txt"), "bad\n");
  assert.throws(() => assertUpstream(item.upstream, commitId, "samples/TeamsSDK/sample-a/dotnet/sample-a", sourceTree), /worktree changed/);
});
