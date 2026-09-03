import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parse } from "yaml";

import { recordDecision } from "../record-decision.js";

test("records explicit outcome", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "teams-sample-decision-"));
  try {
    const file = path.join(directory, "decisions.yml");
    writeFileSync(
      file,
      "version: 1\ndecisions:\n  - id: DEC-001\n    sample: bot-cards\n    status: proposed\n    proposal:\n      patchDigest: sha256:test\n",
      "utf8",
    );
    recordDecision({
      file,
      id: "DEC-001",
      outcome: "approved",
      actor: "maintainer",
      pullRequest: "123",
    });
    const document = parse(readFileSync(file, "utf8"));
    const decision = document.decisions[0];
    assert.equal(decision.status, "approved");
    assert.equal(decision.authority, "human");
    assert.equal(decision.decidedBy, "maintainer");
    assert.equal(decision.decidedIn, "PR-123");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("enriches a one-click rejected status transition", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "teams-sample-decision-"));
  try {
    const file = path.join(directory, "decisions.yml");
    writeFileSync(
      file,
      "version: 1\ndecisions:\n  - id: DEC-002\n    sample: bot-cards\n    status: rejected\n    proposal:\n      patchDigest: sha256:test\n",
      "utf8",
    );
    recordDecision({
      file,
      id: "DEC-002",
      outcome: "rejected",
      actor: "reviewer",
      pullRequest: "456",
    });
    const decision = parse(readFileSync(file, "utf8")).decisions[0];
    assert.equal(decision.status, "rejected");
    assert.equal(decision.decidedBy, "reviewer");
    assert.equal(decision.decidedIn, "PR-456");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fallback changes only proposal status", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "teams-sample-decision-"));
  try {
    const file = path.join(directory, "decisions.yml");
    writeFileSync(
      file,
      "version: 1\ndecisions:\n  - id: DEC-003\n    sample: bot-cards\n    status: proposed\n    proposal:\n      patchDigest: sha256:test\n",
      "utf8",
    );
    recordDecision({
      file,
      id: "DEC-003",
      outcome: "approved",
      actor: "maintainer",
      pullRequest: "789",
      statusOnly: true,
    });
    const decision = parse(readFileSync(file, "utf8")).decisions[0];
    assert.equal(decision.status, "approved");
    assert.equal(decision.authority, undefined);
    assert.equal(decision.decidedBy, undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
