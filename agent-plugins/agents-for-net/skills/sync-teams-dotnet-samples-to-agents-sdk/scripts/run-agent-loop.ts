#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { SyncError, canonicalJson, sha256Buffer } from "./sync.js";
import { escapeWorkflowCommand, reportRecovery, reportVerification } from "./report-sync.js";

type Data = Record<string, unknown>;
type Outcome = "success" | "failure" | "skipped";

export const DEFAULT_MAX_ATTEMPTS = 5;
export const MAX_MAX_ATTEMPTS = 10;

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface AgentAttemptContext {
  attempt: number;
  maxAttempts: number;
  prompt: string;
  logPath: string;
}

export interface AgentLoopDependencies {
  runAgent(context: AgentAttemptContext): Promise<CommandResult>;
  guard(): Promise<CommandResult>;
  restore(): Promise<CommandResult>;
  verify(outputPath: string): Promise<CommandResult>;
  readVerification(filePath: string): Data;
  copyFile(source: string, destination: string): void;
  reportVerification(filePath: string, phase: string, level: "notice" | "error"): void;
}

export interface AgentLoopConfig {
  sample: string;
  maxAttempts: number;
  outputDirectory: string;
  verificationRoot: string;
  repairContext: string;
}

interface AttemptResult {
  attempt: number;
  phase: string;
  agent: Outcome;
  guard: Outcome;
  restore: Outcome;
  verification: Outcome;
  verificationFile?: string;
  outputDigest?: string;
  errors?: string[];
}

export interface AgentLoopResult {
  version: 1;
  sample: string;
  maxAttempts: number;
  attemptsUsed: number;
  success: boolean;
  terminalReason:
    | "passed"
    | "attempt-limit"
    | "no-progress"
    | "agent-failed"
    | "guard-failed"
    | "restore-failed"
    | "verification-failed";
  message: string;
  successfulVerification?: string;
  attempts: AttemptResult[];
}

interface CliArgs extends AgentLoopConfig {
  repoRoot: string;
  toolRoot: string;
  baseRef: string;
  manifestBaseline: string;
  resultFile: string;
  runnerTemp: string;
}

function isRecord(value: unknown): value is Data {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function commandDetail(result: CommandResult): string {
  const detail = `${result.stderr}\n${result.stdout}`.trim();
  return detail.length > 4_000 ? detail.slice(-4_000) : detail || `exit code ${result.status}`;
}

function verificationData(value: Data, filePath: string): {
  passed: boolean;
  outputDigest: string;
  errors: string[];
} {
  if (
    typeof value.passed !== "boolean" ||
    typeof value.outputDigest !== "string" ||
    !Array.isArray(value.errors)
  ) {
    throw new SyncError(`Invalid verification report: ${filePath}`);
  }
  return {
    passed: value.passed,
    outputDigest: value.outputDigest,
    errors: value.errors.map(String),
  };
}

function failedResult(
  config: AgentLoopConfig,
  attempts: AttemptResult[],
  terminalReason: Exclude<AgentLoopResult["terminalReason"], "passed">,
  message: string,
): AgentLoopResult {
  return {
    version: 1,
    sample: config.sample,
    maxAttempts: config.maxAttempts,
    attemptsUsed: attempts.length,
    success: false,
    terminalReason,
    message,
    attempts,
  };
}

export function buildAgentPrompt(sample: string, attempt: number, maxAttempts: number): string {
  const shared = `Read and follow:
- agent-plugins/agents-for-net/skills/sync-teams-dotnet-samples-to-agents-sdk/SKILL.md
- agent-plugins/agents-for-net/skills/teams-sdk-to-agents-sdk-dotnet-migration/SKILL.md
- agent-plugins/agents-sdk-common/skills/teams-app-manifest/SKILL.md
- .github/teams-sample-sync/agent-prompt.md

SYNC_SAMPLE=${sample}
PLAN_FILE=.sync/context/agent-input.json
UPSTREAM_ROOT=.sync/upstream`;

  if (attempt === 1) {
    return `${shared}

Process only this selected sample. Do not commit, push, create a pull request, or change protected tests.`;
  }

  return `${shared}
VERIFICATION_FILE=.sync/context/verify-latest.json

This is repair attempt ${attempt} of ${maxAttempts}. Read the exact verifier errors and fix every in-scope error with file edits. Continue under the durable decision authority in PLAN_FILE. A proposed decision is not approval: do not implement its recommendation during repair. Leave blocked behavior unchanged and fix only independent validation errors. Do not perform workflow commands, ask questions, or report a plan instead of applying the repair. Do not commit, push, create a pull request, or change protected tests.`;
}

export async function runAgentValidationLoop(
  config: AgentLoopConfig,
  dependencies: AgentLoopDependencies,
): Promise<AgentLoopResult> {
  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1 || config.maxAttempts > MAX_MAX_ATTEMPTS) {
    throw new SyncError(`maxAttempts must be an integer from 1 to ${MAX_MAX_ATTEMPTS}`);
  }

  const attempts: AttemptResult[] = [];
  let previousFailureSignature: string | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const phase = attempt === 1 ? "initial" : `repair-${attempt - 1}`;
    const verificationFile = path.join(config.verificationRoot, `${config.sample}-attempt-${attempt}.json`);
    const logPath = path.join(config.outputDirectory, `agent-result-attempt-${attempt}.txt`);
    const record: AttemptResult = {
      attempt,
      phase,
      agent: "skipped",
      guard: "skipped",
      restore: "skipped",
      verification: "skipped",
    };
    attempts.push(record);

    const agent = await dependencies.runAgent({
      attempt,
      maxAttempts: config.maxAttempts,
      prompt: buildAgentPrompt(config.sample, attempt, config.maxAttempts),
      logPath,
    });
    record.agent = agent.status === 0 ? "success" : "failure";
    if (agent.status !== 0) {
      return failedResult(
        config,
        attempts,
        "agent-failed",
        `Agent attempt ${attempt} failed: ${commandDetail(agent)}`,
      );
    }

    const guard = await dependencies.guard();
    record.guard = guard.status === 0 ? "success" : "failure";
    if (guard.status !== 0) {
      return failedResult(
        config,
        attempts,
        "guard-failed",
        `Write-boundary check failed after attempt ${attempt}: ${commandDetail(guard)}`,
      );
    }

    const restore = await dependencies.restore();
    record.restore = restore.status === 0 ? "success" : "failure";
    if (restore.status !== 0) {
      return failedResult(
        config,
        attempts,
        "restore-failed",
        `Restore failed after attempt ${attempt}: ${commandDetail(restore)}`,
      );
    }

    const verification = await dependencies.verify(verificationFile);
    record.verification = verification.status === 0 ? "success" : "failure";
    record.verificationFile = verificationFile;
    if (verification.status !== 0 && verification.status !== 1) {
      return failedResult(
        config,
        attempts,
        "verification-failed",
        `Verifier failed after attempt ${attempt}: ${commandDetail(verification)}`,
      );
    }

    let parsed: ReturnType<typeof verificationData>;
    try {
      parsed = verificationData(dependencies.readVerification(verificationFile), verificationFile);
    } catch (error) {
      return failedResult(
        config,
        attempts,
        "verification-failed",
        error instanceof Error ? error.message : String(error),
      );
    }
    record.outputDigest = parsed.outputDigest;
    record.errors = parsed.errors;
    dependencies.copyFile(
      verificationFile,
      path.join(config.outputDirectory, `verify-attempt-${attempt}.json`),
    );

    if (verification.status === 0 && parsed.passed) {
      const successfulVerification = path.join(config.verificationRoot, `${config.sample}-first.json`);
      dependencies.copyFile(verificationFile, successfulVerification);
      return {
        version: 1,
        sample: config.sample,
        maxAttempts: config.maxAttempts,
        attemptsUsed: attempts.length,
        success: true,
        terminalReason: "passed",
        message: `Verification passed on attempt ${attempt}`,
        successfulVerification,
        attempts,
      };
    }
    if (verification.status === 0 || parsed.passed) {
      return failedResult(
        config,
        attempts,
        "verification-failed",
        `Verifier exit status and report disagree after attempt ${attempt}`,
      );
    }

    const failureSignature = canonicalJson({ outputDigest: parsed.outputDigest, errors: parsed.errors });
    if (previousFailureSignature === failureSignature) {
      dependencies.reportVerification(verificationFile, phase, "error");
      return failedResult(
        config,
        attempts,
        "no-progress",
        `Verification made no progress after attempt ${attempt}: ${parsed.errors.join("; ")}`,
      );
    }
    if (attempt === config.maxAttempts) {
      dependencies.reportVerification(verificationFile, phase, "error");
      return failedResult(
        config,
        attempts,
        "attempt-limit",
        `Verification remained unresolved after ${attempt} attempts: ${parsed.errors.join("; ")}`,
      );
    }

    dependencies.reportVerification(verificationFile, phase, "notice");
    dependencies.copyFile(verificationFile, config.repairContext);
    previousFailureSignature = failureSignature;
  }

  throw new SyncError("Agent loop ended without a terminal result");
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; logPath?: string },
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const log = options.logPath ? createWriteStream(options.logPath, { flags: "w" }) : undefined;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
      process.stdout.write(chunk);
      log?.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
      process.stderr.write(chunk);
      log?.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (status) => {
      log?.end();
      resolve({
        status: status ?? 2,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

function values(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option?.startsWith("--") || value === undefined) {
      throw new SyncError(`Invalid agent loop argument: ${String(option)}`);
    }
    parsed[option.slice(2)] = value;
  }
  return parsed;
}

function required(parsed: Record<string, string>, name: string): string {
  const value = parsed[name];
  if (value === undefined || value === "") throw new SyncError(`Missing required option: --${name}`);
  return value;
}

function parseArguments(argv: string[], invocationRoot: string): CliArgs {
  const parsed = values(argv);
  const maxAttemptsText = parsed["max-attempts"] ?? String(DEFAULT_MAX_ATTEMPTS);
  const maxAttempts = Number(maxAttemptsText);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_MAX_ATTEMPTS) {
    throw new SyncError(`--max-attempts must be an integer from 1 to ${MAX_MAX_ATTEMPTS}`);
  }
  return {
    repoRoot: path.resolve(invocationRoot, required(parsed, "repo-root")),
    toolRoot: path.resolve(invocationRoot, required(parsed, "tool-root")),
    sample: required(parsed, "sample"),
    maxAttempts,
    baseRef: required(parsed, "base-ref"),
    manifestBaseline: path.resolve(invocationRoot, required(parsed, "manifest-baseline")),
    verificationRoot: path.resolve(invocationRoot, required(parsed, "verification-root")),
    outputDirectory: path.resolve(invocationRoot, required(parsed, "output-directory")),
    repairContext: path.resolve(invocationRoot, required(parsed, "repair-context")),
    resultFile: path.resolve(invocationRoot, required(parsed, "result")),
    runnerTemp: path.resolve(parsed["runner-temp"] ?? process.env.RUNNER_TEMP ?? tmpdir()),
  };
}

function readJson(filePath: string): Data {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) throw new SyncError(`Expected JSON object: ${filePath}`);
  return parsed;
}

export class ProtectedContext {
  readonly directory: string;
  private readonly expected = new Map<string, string>();

  constructor(agentInputPath: string) {
    this.directory = path.dirname(agentInputPath);
    this.expected.set(path.basename(agentInputPath), sha256Buffer(readFileSync(agentInputPath)));
    this.lock();
    this.assertUnchanged();
  }

  private unlock(): void {
    chmodSync(this.directory, 0o700);
    for (const name of this.expected.keys()) {
      const filePath = path.join(this.directory, name);
      if (existsSync(filePath)) chmodSync(filePath, 0o600);
    }
  }

  private lock(): void {
    for (const name of this.expected.keys()) chmodSync(path.join(this.directory, name), 0o400);
    chmodSync(this.directory, 0o500);
  }

  replace(source: string, destination: string): void {
    if (path.dirname(destination) !== this.directory || path.basename(destination) === "agent-input.json") {
      throw new SyncError("Invalid protected repair context destination");
    }
    this.unlock();
    try {
      copyFileSync(source, destination);
      this.expected.set(path.basename(destination), sha256Buffer(readFileSync(destination)));
    } finally {
      this.lock();
    }
    this.assertUnchanged();
  }

  assertUnchanged(): void {
    const actualNames = readdirSync(this.directory).sort();
    const expectedNames = [...this.expected.keys()].sort();
    if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) {
      throw new SyncError("Agent changed protected synchronization context files");
    }
    for (const [name, digest] of this.expected) {
      const filePath = path.join(this.directory, name);
      if (
        !existsSync(filePath) ||
        lstatSync(filePath).isSymbolicLink() ||
        sha256Buffer(readFileSync(filePath)) !== digest
      ) {
        throw new SyncError(`Agent changed protected synchronization context: ${name}`);
      }
    }
  }
}

export function sampleRootFromAgentInput(repoRoot: string, expectedSample: string, inputPath: string): string {
  const input = readJson(inputPath);
  const repository = isRecord(input.repository) ? input.repository : undefined;
  const sample = isRecord(input.sample) ? input.sample : undefined;
  if (
    input.sampleName !== expectedSample ||
    !repository ||
    typeof repository.destinationRoot !== "string" ||
    !sample ||
    typeof sample.destination !== "string"
  ) {
    throw new SyncError("Agent input does not match the selected sample");
  }
  const destinationRoot = path.resolve(repoRoot, repository.destinationRoot);
  const sampleRoot = path.resolve(repoRoot, sample.destination);
  const relative = path.relative(destinationRoot, sampleRoot);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SyncError("Selected sample destination escapes the configured destination root");
  }
  return sampleRoot;
}

function workflowError(title: string, message: string): void {
  process.stderr.write(
    `::error title=${escapeWorkflowCommand(title, true)}::${escapeWorkflowCommand(message)}\n`,
  );
}

function writeOutputs(result: AgentLoopResult): void {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  appendFileSync(
    output,
    `success=${String(result.success)}\nattempts=${result.attemptsUsed}\nterminal_reason=${result.terminalReason}\n`,
    "utf8",
  );
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let args: CliArgs | undefined;
  let result: AgentLoopResult | undefined;
  try {
    args = parseArguments(argv, process.env.INIT_CWD ?? process.cwd());
    mkdirSync(args.outputDirectory, { recursive: true });
    mkdirSync(args.verificationRoot, { recursive: true });
    const agentInputPath = path.join(args.repoRoot, ".sync", "context", "agent-input.json");
    const agentInput = readJson(agentInputPath);
    if (typeof agentInput.upstreamCommit !== "string") {
      throw new SyncError("Agent input is missing the trusted upstream commit");
    }
    const expectedUpstreamCommit = agentInput.upstreamCommit;
    const upstreamRoot = path.join(args.repoRoot, ".sync", "upstream");
    const sampleRoot = sampleRootFromAgentInput(
      args.repoRoot,
      args.sample,
      agentInputPath,
    );
    const protectedContext = new ProtectedContext(agentInputPath);
    const dependencies: AgentLoopDependencies = {
      runAgent: async (context) => {
        const copilotHome = path.join(args!.runnerTemp, `teams-sample-sync-copilot-attempt-${context.attempt}`);
        protectedContext.assertUnchanged();
        const agentResult = await runCommand(
          "copilot",
          [
            "--prompt",
            context.prompt,
            "--silent",
            "--available-tools=apply_patch,create,edit,view,grep,glob",
            "--allow-tool=write",
            "--deny-tool=shell,url",
            "--disable-builtin-mcps",
            "--disallow-temp-dir",
            "--no-ask-user",
            "--no-auto-update",
            "--no-color",
            "--no-remote",
            "--no-remote-export",
          ],
          {
            cwd: args!.repoRoot,
            env: { ...process.env, COPILOT_HOME: copilotHome },
            logPath: context.logPath,
          },
        );
        try {
          protectedContext.assertUnchanged();
          return agentResult;
        } catch (error) {
          return {
            status: 2,
            stdout: agentResult.stdout,
            stderr: `${agentResult.stderr}\n${error instanceof Error ? error.message : String(error)}`.trim(),
          };
        }
      },
      guard: async () => {
        const outputGuard = await runCommand(
          process.execPath,
          [
            path.join(args!.toolRoot, "guard-agent-output.js"),
            "--repo-root",
            args!.repoRoot,
            "--sample",
            args!.sample,
            "--mode",
            "initial",
            "--base-ref",
            args!.baseRef,
            "--manifest-baseline",
            args!.manifestBaseline,
          ],
          { cwd: args!.repoRoot },
        );
        if (outputGuard.status !== 0) return outputGuard;
        const upstreamHead = await runCommand("git", ["-C", upstreamRoot, "rev-parse", "HEAD"], {
          cwd: args!.repoRoot,
        });
        const upstreamStatus = await runCommand(
          "git",
          ["-C", upstreamRoot, "status", "--porcelain=v1", "--untracked-files=all"],
          { cwd: args!.repoRoot },
        );
        if (
          upstreamHead.status !== 0 ||
          upstreamHead.stdout.trim() !== expectedUpstreamCommit ||
          upstreamStatus.status !== 0 ||
          upstreamStatus.stdout.trim() !== ""
        ) {
          return {
            status: 2,
            stdout: `${upstreamHead.stdout}${upstreamStatus.stdout}`,
            stderr: "Agent changed the protected upstream checkout",
          };
        }
        return outputGuard;
      },
      restore: async () => await runCommand("dotnet", ["restore", sampleRoot], { cwd: args!.repoRoot }),
      verify: async (outputPath) =>
        await runCommand(
          process.execPath,
          [
            path.join(args!.toolRoot, "sync.js"),
            "--repo-root",
            args!.repoRoot,
            "verify",
            "--sample",
            args!.sample,
            "--run-build",
            "--no-restore",
            "--validate-schema",
            "--allow-proposed",
            "--output",
            outputPath,
          ],
          { cwd: args!.repoRoot },
        ),
      readVerification: readJson,
      copyFile: (source, destination) => {
        if (destination === args!.repairContext) protectedContext.replace(source, destination);
        else copyFileSync(source, destination);
      },
      reportVerification: (filePath, phase, level) => {
        const annotations = reportVerification({
          verification: filePath,
          phase,
          level,
          ...(level === "error" && process.env.GITHUB_STEP_SUMMARY
            ? { summary: process.env.GITHUB_STEP_SUMMARY }
            : {}),
        });
        process.stdout.write(`${annotations.join("\n")}\n`);
      },
    };
    result = await runAgentValidationLoop(args, dependencies);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const sample = args?.sample ?? "unknown-sample";
    result = {
      version: 1,
      sample,
      maxAttempts: args?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      attemptsUsed: 0,
      success: false,
      terminalReason: "verification-failed",
      message,
      attempts: [],
    };
  }

  if (args) {
    mkdirSync(path.dirname(args.resultFile), { recursive: true });
    writeFileSync(args.resultFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  if (result.success && result.attemptsUsed > 1) {
    reportRecovery({
      sample: result.sample,
      attempts: result.attemptsUsed,
      ...(process.env.GITHUB_STEP_SUMMARY ? { summary: process.env.GITHUB_STEP_SUMMARY } : {}),
    });
  }
  writeOutputs(result);
  if (!result.success) workflowError(`Teams sample sync failed: ${result.sample}`, result.message);
  return result.success ? 0 : 1;
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  process.exitCode = await main();
}
