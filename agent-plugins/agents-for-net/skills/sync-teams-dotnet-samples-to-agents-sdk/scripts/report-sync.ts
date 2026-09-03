#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { SyncError } from "./sync.js";

type AnnotationLevel = "warning" | "error";
type Data = Record<string, unknown>;

interface VerificationReportArgs {
  verification: string;
  phase: string;
  level: AnnotationLevel;
  summary?: string;
}

interface UnresolvedReportArgs {
  sample: string;
  setupOutcome: string;
  firstAgentOutcome: string;
  firstGuardOutcome: string;
  restoreOutcome: string;
  firstVerificationOutcome: string;
  firstSuccess: string;
  repairContextOutcome: string;
  repairAgentOutcome: string;
  repairGuardOutcome: string;
  repairRestoreOutcome: string;
  repairVerificationOutcome: string;
  proposalModeOutcome: string;
  proposalModeValue: string;
  checkpointOutcome: string;
  tentativeOutcome: string;
  tentativeGuardOutcome: string;
  candidateOutcome: string;
  contractOutcome: string;
  reconcileOutcome: string;
  reconcileGuardOutcome: string;
  secondOutcome: string;
  proposalOutcome: string;
  finalizeOutcome: string;
  patchOutcome: string;
  uploadOutcome: string;
  firstVerification: string;
  repairVerification: string;
  candidateVerification: string;
  secondVerification: string;
  artifact: string;
  summary?: string;
}

function record(value: unknown, description: string): Data {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SyncError(`Expected a JSON object in ${description}`);
  }
  return value as Data;
}

function readVerification(filePath: string): Data {
  try {
    return record(JSON.parse(readFileSync(filePath, "utf8")), filePath);
  } catch (error) {
    if (error instanceof SyncError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new SyncError(`Cannot read verification ${filePath}: ${message}`);
  }
}

function verificationErrors(verification: Data): string[] {
  if (!Array.isArray(verification.errors)) return ["Unknown verification failure"];
  const errors = verification.errors.map(String).filter(Boolean);
  return errors.length > 0 ? errors : ["Unknown verification failure"];
}

export function escapeWorkflowCommand(value: string, property = false): string {
  const escaped = value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  return property ? escaped.replaceAll(":", "%3A").replaceAll(",", "%2C") : escaped;
}

function markdownText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("`", "\\`");
}

function annotation(level: AnnotationLevel, title: string, message: string): string {
  return `::${level} title=${escapeWorkflowCommand(title, true)}::${escapeWorkflowCommand(message)}`;
}

function appendSummary(summary: string | undefined, lines: string[]): void {
  if (summary) appendFileSync(summary, `${lines.join("\n")}\n`, "utf8");
}

export function reportVerification(args: VerificationReportArgs): string[] {
  const verification = readVerification(args.verification);
  const sample = String(verification.sample ?? "unknown-sample");
  const errors = verificationErrors(verification);
  const output = errors.map((error) =>
    annotation(args.level, `Teams sample sync: ${sample} (${args.phase})`, error),
  );
  appendSummary(args.summary, [
    `### ${markdownText(sample)}: ${markdownText(args.phase)} verification`,
    "",
    `- Result: ${args.level === "warning" ? "repair required" : "failed"}`,
    ...errors.map((error) => `- Error: ${markdownText(error)}`),
    "",
  ]);
  return output;
}

function existingVerification(paths: string[]): Data | undefined {
  const selected = paths.find((candidate) => existsSync(candidate));
  return selected ? readVerification(selected) : undefined;
}

export function unresolvedReason(args: UnresolvedReportArgs): string {
  if (args.setupOutcome !== "success") {
    return `Trusted synchronization setup did not succeed (outcome: ${args.setupOutcome})`;
  }
  if (args.firstAgentOutcome !== "success") {
    return `Migration agent did not succeed (outcome: ${args.firstAgentOutcome})`;
  }
  if (args.firstGuardOutcome !== "success") {
    return `Initial agent write-boundary check did not succeed (outcome: ${args.firstGuardOutcome})`;
  }
  if (args.restoreOutcome !== "success") {
    return `Sample restore did not succeed (outcome: ${args.restoreOutcome})`;
  }
  if (args.firstSuccess !== "true") {
    if (args.firstVerificationOutcome !== "failure") {
      return `Initial verification did not run successfully (outcome: ${args.firstVerificationOutcome})`;
    }
    if (args.repairContextOutcome !== "success") {
      return `Repair context preparation failed; the initial verification report is missing or unavailable (outcome: ${args.repairContextOutcome})`;
    }
    if (args.repairAgentOutcome !== "success") {
      return `Bounded repair agent did not succeed (outcome: ${args.repairAgentOutcome})`;
    }
    if (args.repairGuardOutcome !== "success") {
      return `Repair write-boundary check did not succeed (outcome: ${args.repairGuardOutcome})`;
    }
    if (args.repairRestoreOutcome !== "success") {
      return `Repaired sample restore did not succeed (outcome: ${args.repairRestoreOutcome})`;
    }
    if (args.repairVerificationOutcome !== "failure") {
      return `Repaired verification did not run successfully (outcome: ${args.repairVerificationOutcome})`;
    }
    const verification = existingVerification([args.repairVerification]);
    const errors = verification
      ? verificationErrors(verification).join("; ")
      : "The verification command failed before it produced a report";
    return `Verification remained unresolved after the bounded repair: ${errors}`;
  }
  if (args.proposalModeOutcome !== "success") {
    return `Decision detection did not succeed (outcome: ${args.proposalModeOutcome})`;
  }
  if (args.checkpointOutcome !== "success") {
    return `Safe migration checkpoint did not succeed (outcome: ${args.checkpointOutcome})`;
  }
  if (args.proposalModeValue === "true") {
    if (args.tentativeOutcome !== "success") {
      return `Tentative decision agent did not succeed (outcome: ${args.tentativeOutcome})`;
    }
    if (args.tentativeGuardOutcome !== "success") {
      return `Tentative write-boundary check did not succeed (outcome: ${args.tentativeGuardOutcome})`;
    }
    if (args.candidateOutcome !== "success") {
      const verification = existingVerification([args.candidateVerification]);
      const errors = verification
        ? verificationErrors(verification).join("; ")
        : `outcome: ${args.candidateOutcome}`;
      return `Tentative candidate verification failed: ${errors}`;
    }
  }
  if (args.contractOutcome !== "success" && args.contractOutcome !== "skipped") {
    return `Protected contract tests did not succeed (outcome: ${args.contractOutcome})`;
  }
  if (args.reconcileOutcome !== "success") {
    return `Reconciliation did not succeed (outcome: ${args.reconcileOutcome})`;
  }
  if (args.reconcileGuardOutcome !== "success") {
    return `Reconciliation write-boundary check did not succeed (outcome: ${args.reconcileGuardOutcome})`;
  }
  if (args.secondOutcome !== "success") {
    const verification = existingVerification([args.secondVerification]);
    const errors = verification ? verificationErrors(verification).join("; ") : `outcome: ${args.secondOutcome}`;
    return `Repeated verification failed: ${errors}`;
  }
  if (args.proposalOutcome !== "success") {
    return `Decision proposal capture did not succeed (outcome: ${args.proposalOutcome})`;
  }
  if (args.proposalModeValue !== "true" && args.finalizeOutcome !== "success") {
    return `State finalization did not succeed (outcome: ${args.finalizeOutcome})`;
  }
  if (args.patchOutcome !== "success") {
    return `Validated patch creation did not succeed (outcome: ${args.patchOutcome})`;
  }
  if (args.uploadOutcome !== "success") {
    return `Diagnostic artifact upload did not succeed (outcome: ${args.uploadOutcome})`;
  }
  return "The sample did not reach a successful terminal state";
}

export function reportUnresolved(args: UnresolvedReportArgs): string[] {
  const reason = unresolvedReason(args);
  appendSummary(args.summary, [
    `## Teams sample sync failed: ${markdownText(args.sample)}`,
    "",
    `- Reason: ${markdownText(reason)}`,
    `- Trusted setup: ${markdownText(args.setupOutcome)}`,
    `- Migration agent: ${markdownText(args.firstAgentOutcome)}`,
    `- Initial write boundary: ${markdownText(args.firstGuardOutcome)}`,
    `- Restore: ${markdownText(args.restoreOutcome)}`,
    `- Initial verification: ${markdownText(args.firstVerificationOutcome)}`,
    `- Initial or repaired verification: ${markdownText(args.firstSuccess)}`,
    `- Repair context: ${markdownText(args.repairContextOutcome)}`,
    `- Repair agent: ${markdownText(args.repairAgentOutcome)}`,
    `- Repair write boundary: ${markdownText(args.repairGuardOutcome)}`,
    `- Repair restore: ${markdownText(args.repairRestoreOutcome)}`,
    `- Repair verification: ${markdownText(args.repairVerificationOutcome)}`,
    `- Decision detection: ${markdownText(args.proposalModeOutcome)}`,
    `- Safe checkpoint: ${markdownText(args.checkpointOutcome)}`,
    `- Tentative agent: ${markdownText(args.tentativeOutcome)}`,
    `- Tentative write boundary: ${markdownText(args.tentativeGuardOutcome)}`,
    `- Tentative verification: ${markdownText(args.candidateOutcome)}`,
    `- Contract tests: ${markdownText(args.contractOutcome)}`,
    `- Reconciliation: ${markdownText(args.reconcileOutcome)}`,
    `- Reconciliation write boundary: ${markdownText(args.reconcileGuardOutcome)}`,
    `- Repeated verification: ${markdownText(args.secondOutcome)}`,
    `- Decision proposal capture: ${markdownText(args.proposalOutcome)}`,
    `- Finalization: ${markdownText(args.finalizeOutcome)}`,
    `- Patch creation: ${markdownText(args.patchOutcome)}`,
    `- Artifact upload: ${markdownText(args.uploadOutcome)}`,
    `- Diagnostic artifact: ${markdownText(args.artifact)}`,
    "",
  ]);
  return [annotation("error", `Teams sample sync failed: ${args.sample}`, reason)];
}

function values(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option?.startsWith("--") || value === undefined) {
      throw new SyncError(`Invalid report argument: ${String(option)}`);
    }
    parsed[option.slice(2)] = value;
  }
  return parsed;
}

function required(parsed: Record<string, string>, name: string): string {
  const value = parsed[name];
  if (value === undefined) throw new SyncError(`Missing required option: --${name}`);
  return value;
}

export function main(argv = process.argv.slice(2)): number {
  try {
    const command = argv[0];
    const parsed = values(argv.slice(1));
    const summary = process.env.GITHUB_STEP_SUMMARY;
    let output: string[];
    if (command === "verification") {
      const level = required(parsed, "level");
      if (level !== "warning" && level !== "error") {
        throw new SyncError("--level must be warning or error");
      }
      output = reportVerification({
        verification: path.resolve(required(parsed, "verification")),
        phase: required(parsed, "phase"),
        level,
        ...(summary ? { summary } : {}),
      });
    } else if (command === "unresolved") {
      output = reportUnresolved({
        sample: required(parsed, "sample"),
        setupOutcome: required(parsed, "setup-outcome"),
        firstAgentOutcome: required(parsed, "first-agent-outcome"),
        firstGuardOutcome: required(parsed, "first-guard-outcome"),
        restoreOutcome: required(parsed, "restore-outcome"),
        firstVerificationOutcome: required(parsed, "first-verification-outcome"),
        firstSuccess: required(parsed, "first-success"),
        repairContextOutcome: required(parsed, "repair-context-outcome"),
        repairAgentOutcome: required(parsed, "repair-agent-outcome"),
        repairGuardOutcome: required(parsed, "repair-guard-outcome"),
        repairRestoreOutcome: required(parsed, "repair-restore-outcome"),
        repairVerificationOutcome: required(parsed, "repair-verification-outcome"),
        proposalModeOutcome: required(parsed, "proposal-mode-outcome"),
        proposalModeValue: required(parsed, "proposal-mode-value"),
        checkpointOutcome: required(parsed, "checkpoint-outcome"),
        tentativeOutcome: required(parsed, "tentative-outcome"),
        tentativeGuardOutcome: required(parsed, "tentative-guard-outcome"),
        candidateOutcome: required(parsed, "candidate-outcome"),
        contractOutcome: required(parsed, "contract-outcome"),
        reconcileOutcome: required(parsed, "reconcile-outcome"),
        reconcileGuardOutcome: required(parsed, "reconcile-guard-outcome"),
        secondOutcome: required(parsed, "second-outcome"),
        proposalOutcome: required(parsed, "proposal-outcome"),
        finalizeOutcome: required(parsed, "finalize-outcome"),
        patchOutcome: required(parsed, "patch-outcome"),
        uploadOutcome: required(parsed, "upload-outcome"),
        firstVerification: path.resolve(required(parsed, "first-verification")),
        repairVerification: path.resolve(required(parsed, "repair-verification")),
        candidateVerification: path.resolve(required(parsed, "candidate-verification")),
        secondVerification: path.resolve(required(parsed, "second-verification")),
        artifact: required(parsed, "artifact"),
        ...(summary ? { summary } : {}),
      });
    } else {
      throw new SyncError("Expected report command: verification or unresolved");
    }
    process.stdout.write(`${output.join("\n")}\n`);
    return command === "unresolved" ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${annotation("error", "Teams sample sync reporter failed", message)}\n`);
    return 2;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  process.exitCode = main();
}
