import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { stringify } from "yaml";

import { guardAgentOutput } from "../guard-agent-output.js";

function git(root: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, String(result.stderr));
}

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "teams-agent-guard-"));
  const config = path.join(root, ".github", "teams-sample-sync");
  const sample = path.join(root, "samples", "dotnet", "teams", "sample-a");
  mkdirSync(config, { recursive: true });
  mkdirSync(sample, { recursive: true });
  writeFileSync(
    path.join(config, "targets.yml"),
    stringify({
      destinationRoot: "samples/dotnet/teams",
      samples: { "sample-a": { destination: "sample-a" } },
    }),
    "utf8",
  );
  writeFileSync(path.join(config, "decisions.yml"), "version: 1\ndecisions: []\n", "utf8");
  writeFileSync(path.join(sample, "Program.cs"), "before\n", "utf8");
  git(root, "init", "-q");
  git(root, "config", "core.autocrlf", "false");
  git(root, "config", "user.email", "sync@example.com");
  git(root, "config", "user.name", "Sync Test");
  git(root, "add", ".");
  git(root, "commit", "-qm", "baseline");
  return root;
}

test("allows one complete proposed decision and selected sample changes", () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, "samples", "dotnet", "teams", "sample-a", "Program.cs"), "after\n", "utf8");
    writeFileSync(
      path.join(root, ".github", "teams-sample-sync", "decisions.yml"),
      stringify({
        version: 1,
        decisions: [{
          id: "DEC-001",
          sample: "sample-a",
          status: "proposed",
          question: "Apply behavior?",
          recommendation: "Approve.",
          evidence: "Upstream change.",
          impact: "Behavior changes.",
          invalidatesOn: "Upstream removes it.",
        }],
      }),
      "utf8",
    );
    assert.deepEqual(guardAgentOutput({ repoRoot: root, sample: "sample-a", mode: "initial", baseRef: "HEAD" }).proposedDecisionIds, ["DEC-001"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects agent changes outside the selected sample", () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, "README.md"), "unauthorized\n", "utf8");
    assert.throws(
      () => guardAgentOutput({ repoRoot: root, sample: "sample-a", mode: "initial", baseRef: "HEAD" }),
      /unauthorized paths: README.md/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an agent-created commit", () => {
  const root = fixture();
  try {
    const baseRef = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
    writeFileSync(path.join(root, "samples", "dotnet", "teams", "sample-a", "Program.cs"), "committed\n", "utf8");
    git(root, "add", ".");
    git(root, "commit", "-qm", "agent commit");
    assert.throws(
      () => guardAgentOutput({ repoRoot: root, sample: "sample-a", mode: "stable", baseRef }),
      /Agent changed HEAD/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
