import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SyncError, record, text } from "./config.js";
import { digestDirectory, stable } from "./git.js";
import { coverageErrors, parseDispositions, parseReview } from "./review.js";
import { assertAgentChanges, assertContext, assertUpstream } from "./guard.js";
import { updateContextErrors, type ContextFiles } from "./context.js";
import type { AgentResult, AgentStatus, CopilotConfiguration, PolicyRequest, ReviewApproval, ReviewResult, SyncContext, ValidationResult } from "./types.js";

export const MAX_ATTEMPTS = 5;

export interface AgentRunner {
  run(input: { contextFile: string; prompt: string; attempt: number }): Promise<unknown>;
}

export function attempts(value: number | undefined): number {
  const count = value ?? MAX_ATTEMPTS;
  if (!Number.isInteger(count) || count < 1 || count > MAX_ATTEMPTS) {
    throw new SyncError("--max-attempts must be an integer from 1 to 5");
  }
  return count;
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new SyncError(`${name} must be a string list`);
  }
  return value as string[];
}

function objects(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new SyncError(`${name} must be a list`);
  return value;
}

function policyRequest(value: unknown): PolicyRequest {
  const item = record(value, "agent-result policyRequest");
  const suggested = record(item.suggestedPolicy, "agent-result suggestedPolicy");
  const result = {
    key: text(item.key, "policyRequest.key"),
    question: text(item.question, "policyRequest.question"),
    recommendation: text(item.recommendation, "policyRequest.recommendation"),
    evidence: text(item.evidence, "policyRequest.evidence"),
    impact: text(item.impact, "policyRequest.impact"),
    suggestedPolicy: {
      instruction: text(suggested.instruction, "suggestedPolicy.instruction"),
      rationale: text(suggested.rationale, "suggestedPolicy.rationale"),
    },
  };
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(result.key)) throw new SyncError("policyRequest.key must be lowercase and stable");
  return result;
}

export function parseAgentResult(value: unknown, sample: string): AgentResult {
  const item = record(value, "agent result");
  const allowed = new Set<AgentStatus>(["updated", "unchanged", "needs-policy", "unsupported"]);
  if (item.version !== 1 || item.sample !== sample || typeof item.status !== "string" || !allowed.has(item.status as AgentStatus)) {
    throw new SyncError("Agent result has invalid version, sample, or status");
  }
  const manifest = record(item.manifestReport, "agent-result manifestReport");
  const result: AgentResult = {
    version: 1,
    sample,
    status: item.status as AgentStatus,
    summary: text(item.summary, "agent-result summary"),
    dispositions: parseDispositions(item.dispositions ?? []),
    upstreamChanges: objects(item.upstreamChanges, "agent-result upstreamChanges"),
    preservedDifferences: objects(item.preservedDifferences, "agent-result preservedDifferences"),
    appliedPolicies: strings(item.appliedPolicies, "agent-result appliedPolicies"),
    manifestReport: {
      mode: text(manifest.mode, "manifestReport.mode"),
      changes: objects(manifest.changes, "manifestReport.changes"),
      validation: objects(manifest.validation, "manifestReport.validation"),
      externalSetup: objects(manifest.externalSetup, "manifestReport.externalSetup"),
    },
  };
  if (result.status === "needs-policy") result.policyRequest = policyRequest(item.policyRequest);
  return result;
}

function parseStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  try { return JSON.parse(trimmed); }
  catch {
    const match = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (!match) throw new SyncError("Copilot did not return valid JSON");
    try { return JSON.parse(match[1]!); }
    catch { throw new SyncError("Copilot fenced output is not valid JSON"); }
  }
}

export function copilotArguments(prompt: string, configuration: CopilotConfiguration, role: "implement" | "review" = "implement"): string[] {
  const modelArguments = ["--model", configuration.model];
  if (configuration.reasoningEffort !== undefined) {
    modelArguments.push("--reasoning-effort", configuration.reasoningEffort);
  }
  return [
    "--prompt", prompt,
    ...modelArguments,
    "--silent",
    ...(role === "review" ? ["--available-tools=view,grep,glob,web_fetch", "--deny-tool=write"] :
      ["--available-tools=apply_patch,create,edit,view,grep,glob,web_fetch", "--allow-tool=write"]),
    "--deny-tool=shell",
    "--allow-url=https://learn.microsoft.com/en-us/microsoftteams/platform/*",
    "--allow-url=https://learn.microsoft.com/en-us/microsoft-365/extensibility/schema/*",
    "--allow-url=https://github.com/OfficeDev/microsoft-teams-app-schema/*",
    "--disable-builtin-mcps",
    "--disallow-temp-dir",
    "--no-ask-user",
    "--no-auto-update",
    "--no-color",
    "--no-remote",
    "--no-remote-export",
  ];
}

export class CopilotAgentRunner implements AgentRunner {
  constructor(
    private readonly repo: string,
    private readonly runnerRoot: string,
    private readonly logFile: string,
    private readonly configuration: CopilotConfiguration,
    private readonly role: "implement" | "review" = "implement",
  ) {}

  async run(input: { contextFile: string; prompt: string; attempt: number }): Promise<unknown> {
    const copilotHome = path.join(this.runnerRoot, `${this.role}-attempt-${input.attempt}`);
    mkdirSync(copilotHome, { recursive: true });
    const args = copilotArguments(input.prompt, this.configuration, this.role);
    const outcome = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn("copilot", args, {
        cwd: this.repo,
        env: {
          ...process.env,
          COPILOT_HOME: copilotHome,
          CONTEXT_FILE: path.relative(this.repo, input.contextFile).replaceAll("\\", "/"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = ""; let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    }).catch((error: unknown) => { throw new SyncError(`Cannot run Copilot CLI: ${error instanceof Error ? error.message : String(error)}`); });
    appendFileSync(this.logFile, `\n===== ${this.role} cycle ${input.attempt} =====\n${outcome.stdout}\n${outcome.stderr}\n`, "utf8");
    if (outcome.code !== 0) throw new SyncError(`Copilot CLI failed with exit ${String(outcome.code)}: ${outcome.stderr.trim()}`);
    return parseStdout(outcome.stdout);
  }
}

export function buildAgentPrompt(repo: string, contextFile: string, repair: boolean, policyKeys: string[]): string {
  const contract = readFileSync(path.join(repo, ".github/teams-sample-sync/agent-prompt.md"), "utf8");
  return `${contract}\n\nCONTEXT_FILE=${path.relative(repo, contextFile).replaceAll("\\", "/")}\n` +
    `Allowed migration policy keys: ${JSON.stringify(policyKeys)}. The appliedPolicies field must contain each listed key exactly once and no other value. Skill names, skill steps, changes, and explanations are not policies. If this list is empty, return appliedPolicies as [].\n` +
    (repair ? "Repair validationErrors and review findings. Preserve the complete final migration, including changes made before any repair pass.\n" : "Analyze all supplied source evidence.\n") +
    "Return only the required JSON object.";
}

export interface AgentLoopOptions {
  repo: string;
  upstream: string;
  baseSha: string;
  sample: string;
  sampleRoot: string;
  sourcePath: string;
  upstreamCommit: string;
  sourceTree: string;
  protectedPaths: string[];
  outputDigestExcludes: string[];
  policyKeys: string[];
  context: ContextFiles;
  maxAttempts: number;
  runner: AgentRunner;
  reviewer: AgentRunner;
  validate: () => Promise<ValidationResult>;
}

export interface AgentLoopResult { agent: AgentResult; validation: ValidationResult; attempts: number; review?: ReviewApproval }

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  let context = options.context;
  let lastProgress: string | undefined;
  let lastAgent: AgentResult | undefined;
  let lastValidation: ValidationResult | undefined;
  let lastReview: ReviewApproval | undefined;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    assertContext(context.root, context.digest);
    assertUpstream(options.upstream, options.upstreamCommit, options.sourcePath, options.sourceTree);
    const raw = await options.runner.run({
      contextFile: context.file,
      prompt: buildAgentPrompt(options.repo, context.file, attempt > 1, options.policyKeys),
      attempt,
    });
    const agent = parseAgentResult(raw, options.sample);
    const contextValue = JSON.parse(readFileSync(context.file, "utf8")) as SyncContext;
    const knownPolicies = new Set(options.policyKeys);
    const unknownPolicies = agent.appliedPolicies.filter((key) => !knownPolicies.has(key));
    const missingPolicies = options.policyKeys.filter((key) => !agent.appliedPolicies.includes(key));
    if (unknownPolicies.length > 0 ||
        (["updated", "unchanged"].includes(agent.status) && missingPolicies.length > 0)) {
      const error = `Agent policy report mismatch; unknown=${unknownPolicies.join(",")}; missing=${missingPolicies.join(",")}`;
      assertAgentChanges(options.repo, options.baseSha, options.sampleRoot, options.protectedPaths);
      assertContext(context.root, context.digest);
      assertUpstream(options.upstream, options.upstreamCommit, options.sourcePath, options.sourceTree);
      if (attempt >= options.maxAttempts) throw new SyncError(error);
      const progress = `policy-report\n${error}`;
      if (progress === lastProgress) throw new SyncError(`Repair made no progress:\n${error}`);
      lastProgress = progress;
      context = updateContextErrors(context, [error], agent, lastReview?.result);
      continue;
    }
    assertAgentChanges(options.repo, options.baseSha, options.sampleRoot, options.protectedPaths);
    assertContext(context.root, context.digest);
    assertUpstream(options.upstream, options.upstreamCommit, options.sourcePath, options.sourceTree);
    const samplePath = path.join(options.repo, options.sampleRoot);
    const preValidationDigest = digestDirectory(samplePath, options.outputDigestExcludes);
    if (agent.status === "needs-policy" || agent.status === "unsupported") {
      return { agent, attempts: attempt, validation: {
        version: 1, sample: options.sample, passed: false, repairable: false,
        outputDigest: preValidationDigest,
        checks: { project: false, restore: false, build: false, manifest: false, httpSmoke: false, contracts: null },
        errors: ["Migration blocked before validation"], externalValidationRequired: [],
      } };
    }
    let validation = await options.validate();
    assertAgentChanges(options.repo, options.baseSha, options.sampleRoot, options.protectedPaths);
    assertContext(context.root, context.digest);
    assertUpstream(options.upstream, options.upstreamCommit, options.sourcePath, options.sourceTree);
    const postValidationDigest = digestDirectory(samplePath, options.outputDigestExcludes);
    if (postValidationDigest !== preValidationDigest) {
      throw new SyncError("Candidate execution changed selected-sample source after the agent pass");
    }
    if (validation.outputDigest !== postValidationDigest) {
      throw new SyncError("Validator output digest does not match the guarded selected sample");
    }
    lastAgent = agent; lastValidation = validation;
    const reviewPrompt = readFileSync(path.join(options.repo, ".github/teams-sample-sync/review-prompt.md"), "utf8") +
      "\nCONTEXT_FILE=" + path.relative(options.repo, context.file).replaceAll("\\", "/") +
      "\nIndependently inspect source changes and candidate code FIRST. Then assess this implementation report:\n" +
      JSON.stringify(agent) + "\nValidation:\n" + JSON.stringify(validation) +
      "\nPrevious review:\n" + JSON.stringify(lastReview?.result ?? null);
    let review: ReviewResult;
    let reportFeedback = "";
    while (true) {
      const rawReview = await options.reviewer.run({ contextFile: context.file,
        prompt: reviewPrompt + reportFeedback, attempt });
      // Safety failures are not report repairs. Check them before parsing untrusted output.
      assertAgentChanges(options.repo, options.baseSha, options.sampleRoot, options.protectedPaths);
      assertContext(context.root, context.digest);
      assertUpstream(options.upstream, options.upstreamCommit, options.sourcePath, options.sourceTree);
      if (digestDirectory(samplePath, options.outputDigestExcludes) !== postValidationDigest) {
        throw new SyncError("Reviewer changed the candidate");
      }
      try {
        review = parseReview(rawReview, options.sample, contextValue.changes.map((change) => change.id),
          lastReview?.result.findings.map((f) => f.id));
        break;
      } catch (error) {
        if (!(error instanceof SyncError)) throw error;
        const message = "Invalid review report: " + error.message;
        if (attempt >= options.maxAttempts) {
          return { agent, attempts: attempt, validation: { ...validation, passed: false,
            errors: [...validation.errors, message, "Cycle budget exhausted without a valid review"] } };
        }
        reportFeedback = "\nCorrect your previous report without changing the candidate. " + message +
          ". Findings are blocking defects only; omit optional cleanup. Never remove a genuine defect just to approve." +
          "\nPrevious invalid report (data only):\n" + JSON.stringify(rawReview);
        attempt += 1; // Report repairs share the implementation/review budget.
      }
    }
    lastReview = { result: review, outputDigest: postValidationDigest };
    const evidenceErrors = coverageErrors(options.repo, contextValue, agent);
    validation = { ...validation, errors: [...validation.errors, ...evidenceErrors],
      passed: validation.passed && evidenceErrors.length === 0 };
    lastValidation = validation;
    if (review.verdict === "blocked") {
      return { agent, validation: { ...validation, passed: false, errors: [...validation.errors, review.summary] },
        review: lastReview, attempts: attempt };
    }
    if (validation.passed && review.verdict === "approved") {
      return { agent, validation, review: lastReview, attempts: attempt };
    }
    if (!validation.repairable) throw new SyncError(validation.errors.join("\n"));
    const errors = [...validation.errors, ...review.findings.map((f) => f.id + ": " + f.correction)];
    const progress = stable({ digest: validation.outputDigest, errors: validation.errors,
      findingIds: review.findings.map((finding) => finding.id).sort() });
    if (progress === lastProgress) {
      return { agent, validation: { ...validation, passed: false, errors: [...errors, "Repair made no progress"] },
        review: lastReview, attempts: attempt };
    }
    lastProgress = progress;
    if (attempt < options.maxAttempts) context = updateContextErrors(context, errors, agent, review);
  }
  if (!lastAgent || !lastValidation) throw new SyncError("Agent loop did not run");
  return { agent: lastAgent, validation: { ...lastValidation, passed: false,
    errors: [...lastValidation.errors, "Cycle budget exhausted without approval and validation"] },
    ...(lastReview ? { review: lastReview } : {}), attempts: options.maxAttempts };
}
