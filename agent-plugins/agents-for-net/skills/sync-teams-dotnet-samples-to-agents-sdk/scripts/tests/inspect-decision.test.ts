import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { stringify } from "yaml";

import { inspectDecisionTransition } from "../inspect-decision.js";
import { directoryDigest } from "../sync.js";

function git(root: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, String(result.stderr));
}

test("accepts only an exact proposed-to-approved status edit", () => {
  const root = mkdtempSync(path.join(tmpdir(), "teams-decision-inspect-"));
  try {
    const config = path.join(root, ".github", "teams-sample-sync");
    const sample = path.join(root, "samples", "dotnet", "teams", "sample-a");
    const proposals = path.join(config, "proposals");
    mkdirSync(sample, { recursive: true });
    mkdirSync(proposals, { recursive: true });
    writeFileSync(path.join(sample, "Program.cs"), "candidate\n", "utf8");
    const patchPath = path.join(proposals, "DEC-001.patch");
    writeFileSync(
      patchPath,
      "diff --git a/samples/dotnet/teams/sample-a/Program.cs b/samples/dotnet/teams/sample-a/Program.cs\n--- a/samples/dotnet/teams/sample-a/Program.cs\n+++ b/samples/dotnet/teams/sample-a/Program.cs\n@@ -1 +1 @@\n-base\n+candidate\n",
      "utf8",
    );
    const proposal = {
      upstreamCommit: "a".repeat(40),
      sourceTree: "b".repeat(40),
      proposalInputDigest: "sha256:input",
      baseOutputDigest: "sha256:base",
      candidateOutputDigest: directoryDigest(sample),
      patchDigest: `sha256:${createHash("sha256").update(readFileSync(patchPath)).digest("hex")}`,
      patchPath: ".github/teams-sample-sync/proposals/DEC-001.patch",
    };
    writeFileSync(
      path.join(config, "targets.yml"),
      stringify({
        destinationRoot: "samples/dotnet/teams",
        samples: { "sample-a": { destination: "sample-a" } },
      }),
      "utf8",
    );
    writeFileSync(path.join(config, "ownership.yml"), "version: 1\noutputDigestExcludes: []\n", "utf8");
    const decision = { id: "DEC-001", sample: "sample-a", status: "proposed", proposal };
    writeFileSync(path.join(config, "decisions.yml"), stringify({ version: 1, decisions: [decision] }), "utf8");
    git(root, "init", "-q");
    git(root, "config", "user.email", "sync@example.com");
    git(root, "config", "user.name", "Sync Test");
    git(root, "add", ".");
    git(root, "commit", "-qm", "proposal");
    decision.status = "approved";
    writeFileSync(path.join(config, "decisions.yml"), stringify({ version: 1, decisions: [decision] }), "utf8");
    git(root, "add", path.join(config, "decisions.yml"));
    git(root, "commit", "-qm", "approve");

    const result = inspectDecisionTransition({ repoRoot: root });
    assert.equal(result.id, "DEC-001");
    assert.equal(result.outcome, "approved");
    assert.equal(result.sample, "sample-a");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
