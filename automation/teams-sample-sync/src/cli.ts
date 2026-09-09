#!/usr/bin/env node
import type { Tool } from "@github/copilot-sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CopilotAgentRunner, type SdkFactory } from "./agent-runner.js";
import { createContext } from "./context.js";
import { protection, targets, SyncError } from "./config.js";
import { guardCandidate, inspectManifestSchema, submitResult, submitReview, validateTool, validationInProgress, type ToolHost } from "./agent-tools.js";
import { changedPaths, digestDirectory, git, hash, matches, stable } from "./git.js";
import { createPlan } from "./plan.js";
import { prBody, workflowSummary } from "./report.js";
import { coverageErrors, evidenceDigest, parseAgentResult, parseReview } from "./review.js";
import { createState, statePath, validateState } from "./state.js";
import { assertFullValidation, cancelValidationProcesses, prepareManifest, type ValidationRuntime } from "./validate.js";
import { implementationSchema, reviewSchema } from "./tool-schemas.js";
import { runSyncSession } from "./sync-session.js";
import type { AgentEvent, AgentResult, Plan, ReviewResult, State, SyncContext, SyncResult } from "./types.js";

function parseArgs(items: string[]): Record<string, string> { const result: Record<string, string> = {}; for (let index = 0; index < items.length; index += 2) { const option = items[index]; const value = items[index + 1]; if (!option?.startsWith("--") || !value || value.startsWith("--")) throw new SyncError(`Invalid argument: ${String(option)}`); const key = option.slice(2); if (!["repo-root", "upstream-root", "plan", "sample", "output-directory", "output", "result"].includes(key)) throw new SyncError(`Unknown option: ${option}`); if (key in result) throw new SyncError(`Duplicate option: ${option}`); result[key] = value; } return result; }
function required(values: Record<string, string>, name: string): string { const value = values[name]; if (!value) throw new SyncError(`Missing required option: --${name}`); return value; }
function readJson<T>(file: string): T { try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch (error) { throw new SyncError(`Cannot read JSON ${file}: ${error instanceof Error ? error.message : String(error)}`); } }
function writeJson(file: string, value: unknown): void { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function resolveOption(value: string): string { return path.resolve(process.env.INIT_CWD ?? process.cwd(), value); }
function tool(name: string, description: string, schema: Tool["parameters"], handler: (value: unknown) => Promise<unknown> | unknown): Tool { return { name, description, ...(schema ? { parameters: schema } : {}), handler, skipPermission: true }; }

export async function migrateCandidate(repo: string, values: Record<string, string>, dependencies: { sdkFactory?: SdkFactory; validationRuntime?: ValidationRuntime } = {}): Promise<number> {
  const upstream = resolveOption(required(values, "upstream-root")); const plan = readJson<Plan>(resolveOption(required(values, "plan"))); const sample = required(values, "sample"); const output = resolveOption(required(values, "output-directory")); mkdirSync(output, { recursive: true });
  const configured = targets(repo); const owner = protection(repo); const target = configured.samples[sample]; const entry = plan.samples[sample];
  if (plan.version !== 2 || !target || !entry?.upstreamCommit || !entry.sourceTree || !entry.inputDigest || !entry.componentDigests || entry.status !== "pending") throw new SyncError("Plan does not contain a pending selected sample");
  if (entry.componentDigests.copilot !== hash(stable(configured.copilot))) throw new SyncError("Copilot configuration differs from the selected plan");
  const baseSha = git(repo, ["rev-parse", "HEAD"]) as string; const sampleRelative = `${configured.destinationRoot}/${target.destination}`.replaceAll("\\", "/"); const sampleRoot = path.join(repo, sampleRelative); const contextFiles = createContext(repo, upstream, plan, sample); const context = readJson<SyncContext>(contextFiles.file);
  const events: AgentEvent[] = []; const observedModels: SyncResult["observedModels"] = []; const agentLog = path.join(output, "agent-log.txt"); writeFileSync(agentLog, "", "utf8"); writeJson(path.join(output, "source-context.json"), context);
  const syncResult: SyncResult = { version: 3, sample, status: "failed", publishable: false, baseSha, previousUpstreamCommit: context.upstream.previousCommit, upstreamCommit: entry.upstreamCommit, upstreamChanges: context.upstream.changes, changedComponents: entry.changedComponents, copilot: configured.copilot, observedModels, migrationPolicies: context.policies, sourceTree: entry.sourceTree, sourceContextDigest: hash(stable(context)), inputDigest: entry.inputDigest, componentDigests: entry.componentDigests, metrics: { repairPasses: 0, rejectedImplementerReports: 0, rejectedReviewerReports: 0 }, diagnostics: [], sourceRepository: context.upstream.repository };
  let acceptedAgent: AgentResult | undefined; let acceptedReview: ReviewResult | undefined;
  const host: ToolHost = { repo, upstream, baseSha, sampleRoot: sampleRelative, sourcePath: `${configured.upstream.root}/${target.source}`, upstreamCommit: entry.upstreamCommit, sourceTree: entry.sourceTree, protectedPaths: owner.protectedPaths, excludes: owner.outputDigestExcludes, contextRoot: contextFiles.root, contextDigest: contextFiles.digest, context, configured, ...(dependencies.validationRuntime ? { validationRuntime: dependencies.validationRuntime } : {}), onValidation: (validation) => { syncResult.validation = validation; events.push({ at: new Date().toISOString(), stage: syncResult.failureStage ?? "validate", type: "validation-completed", detail: { validation } }); }, acceptImplementation: (result) => { acceptedAgent = result; }, acceptReview: (result) => { acceptedReview = result; } };
  const skillDirectories = [path.join(repo, "automation/teams-sample-sync/skills/sync-teams-dotnet-samples-to-agents-sdk"), path.join(repo, configured.migrationSkill), path.join(repo, configured.manifestSkill)];
  const runner = new CopilotAgentRunner(repo, sampleRelative, configured.copilot, agentLog, observedModels, skillDirectories, dependencies.sdkFactory, () => validationInProgress(host), () => { guardCandidate(host); }, (role, message) => {
    if (role === "implementation") syncResult.metrics.rejectedImplementerReports++;
    else syncResult.metrics.rejectedReviewerReports++;
    events.push({ at: new Date().toISOString(), stage: syncResult.failureStage ?? "validate", type: "submission-rejected", detail: { role, error: message } });
  });
  const validateSchema = { type: "object", additionalProperties: false, required: ["group"], properties: { group: { type: "string", enum: ["code", "manifest", "all"] } } };
  const schemaQuery = { type: "object", additionalProperties: false, required: ["path"], properties: { path: { type: "string" } } };
  const implementationTools = [tool("validate_sample", "Run the trusted selected-sample validation.", validateSchema, async (input) => validateTool(host, String((input as { group?: unknown })?.group) as "code" | "manifest" | "all")), tool("inspect_manifest_schema", "Inspect a field in the released selected manifest schema.", schemaQuery, async (input) => inspectManifestSchema(host, String((input as { path?: unknown })?.path))), tool("submit_result", "Submit current structured implementation evidence.", implementationSchema, (input) => submitResult(host, input))];
  const reviewTools = [tool("inspect_manifest_schema", "Inspect a field in the released selected manifest schema.", schemaQuery, async (input) => inspectManifestSchema(host, String((input as { path?: unknown })?.path))), tool("submit_review", "Submit the structured independent review.", reviewSchema, (input) => submitReview(host, input, acceptedAgent?.manifestReport.capabilities.map((capability) => capability.id) ?? [], acceptedReview?.findings.map((finding) => finding.id) ?? []))];
  try {
    if (!process.env.GITHUB_TOKEN) throw new SyncError("Copilot authentication is unavailable: GITHUB_TOKEN is required");
    for (const skill of skillDirectories) if (!existsSync(path.join(skill, "SKILL.md"))) throw new SyncError(`Configured skill is unavailable: ${skill}`);
    prepareManifest(sampleRoot, path.join(repo, configured.canonicalSample), target.manifest);
    const result = await runSyncSession({ sample, contextFile: path.relative(repo, contextFiles.file).replaceAll("\\", "/"), sourceChangeIds: context.changes.map((change) => change.id), policyKeys: context.policies.map((policy) => policy.key), createImplementation: () => runner.open("implementation", implementationTools), createReviewer: () => runner.open("review", reviewTools), validate: (group) => validateTool(host, group), outputDigest: () => guardCandidate(host), coverage: (agent) => coverageErrors(repo, context, agent), cancelValidation: cancelValidationProcesses, event: (event) => { events.push(event); syncResult.failureStage = event.stage; } });
    syncResult.agent = result.agent; if (result.validation) syncResult.validation = result.validation; if (result.review) syncResult.review = result.review; if (result.validation) syncResult.outputDigest = result.validation.outputDigest; syncResult.evidenceDigest = result.evidenceDigest; syncResult.metrics.repairPasses = result.metrics.repairPasses; syncResult.metrics.rejectedImplementerReports += result.metrics.rejectedImplementerReports; syncResult.metrics.rejectedReviewerReports += result.metrics.rejectedReviewerReports;
    if (result.stage === "blocked" || result.agent.status === "needs-policy" || result.agent.status === "unsupported") { syncResult.status = result.agent.status === "needs-policy" || result.agent.status === "unsupported" ? result.agent.status : "failed"; syncResult.error = result.review?.result.blockerReason ?? result.agent.summary; syncResult.failureClass = "blocked"; syncResult.failureStage = result.stage; }
    else if (!result.review || result.review.result.verdict !== "approved") { syncResult.error = "Independent review did not approve the candidate"; syncResult.failureStage = result.stage; }
    else {
      if (!result.validation) throw new SyncError("Current full validation is missing");
      assertFullValidation(result.validation, sample, sampleRoot);
      if (result.review.outputDigest !== result.validation.outputDigest || result.review.evidenceDigest !== evidenceDigest(result.agent) || digestDirectory(sampleRoot, owner.outputDigestExcludes) !== result.review.outputDigest) throw new SyncError("Candidate differs from validated and reviewed bindings");
      const state = createState(sample, entry, result.validation); const lock = statePath(repo, sample); writeJson(lock, state); git(repo, ["add", "-N", "--", sampleRelative, path.relative(repo, lock).replaceAll("\\", "/")]);
      const patch = git(repo, ["diff", "--binary", baseSha, "--", sampleRelative, path.relative(repo, lock).replaceAll("\\", "/")], true) as Buffer; if (patch.length === 0) throw new SyncError("Validated migration produced no sample or state patch"); writeFileSync(path.join(output, "change.patch"), patch);
      syncResult.status = "updated"; syncResult.publishable = true; syncResult.destinationChanges = changedPaths(repo, baseSha).filter((item) => item === path.relative(repo, lock).replaceAll("\\", "/") || item.startsWith(`${sampleRelative}/`)); syncResult.state = state;
    }
  } catch (error) { syncResult.status = "failed"; syncResult.publishable = false; syncResult.error = error instanceof Error ? error.message : String(error); syncResult.failureStage ??= "failed"; syncResult.failureClass = "runtime"; syncResult.diagnostics.push(syncResult.error); }
  finally { try { await runner.close(); } catch (error) { syncResult.publishable = false; syncResult.status = "failed"; syncResult.error = `Runtime cleanup failed: ${String(error)}`; } writeFileSync(path.join(output, "agent-events.jsonl"), events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : ""), "utf8"); }
  writeJson(path.join(output, "sync-result.json"), syncResult); if (syncResult.publishable) writeFileSync(path.join(output, "pr-body.md"), prBody(syncResult), "utf8"); writeFileSync(path.join(output, "workflow-summary.md"), workflowSummary(syncResult), "utf8"); return syncResult.status === "failed" ? 1 : 0;
}

async function migrate(repo: string, values: Record<string, string>): Promise<number> {
  try { return await migrateCandidate(repo, values); }
  catch (error) {
    if (values["output-directory"]) {
      const output = resolveOption(values["output-directory"]);
      const message = error instanceof Error ? error.message : String(error);
      writeJson(path.join(output, "sync-result.json"), { version: 3, sample: values.sample ?? "unknown", status: "failed", publishable: false, failureStage: "preflight", error: message });
      writeFileSync(path.join(output, "workflow-summary.md"), `Synchronization failed during preflight: ${message}\n`, "utf8");
    }
    throw error;
  }
}

function verifyPatch(repo: string, values: Record<string, string>): void {
  const sample = required(values, "sample"); const resultFile = resolveOption(required(values, "result")); const result = readJson<SyncResult>(resultFile);
  if (result.version !== 3) throw new SyncError("Version-2 transient result artifacts are not accepted; regenerate the migration artifact");
  if (result.sample !== sample || result.status !== "updated" || !result.publishable || !result.state || !result.outputDigest || !result.evidenceDigest || !result.validation?.passed || !result.agent || !result.review || result.review.result.verdict !== "approved") throw new SyncError("Only a complete v3 updated result is publishable");
  if (result.validation.outputDigest !== result.outputDigest || result.review.outputDigest !== result.outputDigest || result.review.evidenceDigest !== result.evidenceDigest || result.review.validationId !== result.validation.id || evidenceDigest(result.agent) !== result.evidenceDigest) throw new SyncError("Validation, review, and evidence bindings are stale");
  const contextFile = path.join(path.dirname(resultFile), "source-context.json"); if (!existsSync(contextFile)) throw new SyncError("Trusted source context artifact is missing"); const sourceContext = readJson<SyncContext>(contextFile); if (hash(stable(sourceContext)) !== result.sourceContextDigest || sourceContext.sample !== sample || sourceContext.upstream.currentCommit !== result.upstreamCommit || sourceContext.upstream.currentTree !== result.sourceTree) throw new SyncError("Source context does not match the validated result");
  result.agent = parseAgentResult(result.agent, sample);
  result.review.result = parseReview(result.review.result, sample, sourceContext.changes.map((change) => change.id), result.agent.manifestReport.capabilities.map((capability) => capability.id), result.review.result.resolvedFindingIds);
  assertFullValidation(result.validation, sample, path.join(repo, sourceContext.paths.destination));
  const evidenceErrors = coverageErrors(repo, sourceContext, result.agent);
  if (evidenceErrors.length || !["updated", "unchanged"].includes(result.agent.status)) throw new SyncError(`Invalid implementation evidence: ${evidenceErrors.join("; ")}`);
  if (stable(result.migrationPolicies) !== stable(sourceContext.policies)) throw new SyncError("Reported policies differ from source context");
  const configured = targets(repo); const owner = protection(repo); const target = configured.samples[sample]; if (!target) throw new SyncError("Sample is not selected"); if (stable(result.copilot) !== stable(configured.copilot) || result.componentDigests.copilot !== hash(stable(result.copilot))) throw new SyncError("Copilot configuration differs from validated result");
  const head = git(repo, ["rev-parse", "HEAD"]) as string; if (head !== result.baseSha) throw new SyncError("Publish checkout differs from validated base SHA"); const sampleRelative = `${configured.destinationRoot}/${target.destination}`.replaceAll("\\", "/"); const stateRelative = path.relative(repo, statePath(repo, sample)).replaceAll("\\", "/"); const changed = changedPaths(repo, head);
  if (changed.length === 0 || !result.destinationChanges || stable(changed) !== stable(result.destinationChanges)) throw new SyncError("Applied paths differ from validated result");
  const expectedIds = sourceContext.changes.map((item) => item.id); const dispositionIds = result.agent.dispositions.map((item) => item.changeId); if (new Set(dispositionIds).size !== dispositionIds.length || dispositionIds.length !== expectedIds.length || !expectedIds.every((id) => dispositionIds.includes(id)) || result.review.result.reviewedChangeIds.length !== expectedIds.length || !expectedIds.every((id) => result.review!.result.reviewedChangeIds.includes(id))) throw new SyncError("Review source coverage is incomplete");
  const capabilities = result.agent.manifestReport.capabilities.map((item) => item.id); if (result.review.result.reviewedCapabilityIds.length !== capabilities.length || !capabilities.every((id) => result.review!.result.reviewedCapabilityIds.includes(id))) throw new SyncError("Review capability coverage is incomplete");
  for (const item of changed) { if (item === "manifest-evidence.md" || item.endsWith("/manifest-evidence.md") || matches(item, owner.protectedPaths) || (item !== stateRelative && !item.startsWith(`${sampleRelative}/`))) throw new SyncError(`Patch changes prohibited path: ${item}`); }
  const patchFile = path.join(path.dirname(resultFile), "change.patch"); if (!existsSync(patchFile)) throw new SyncError("Result patch is missing"); git(repo, ["apply", "--check", "--reverse", "--binary", patchFile]); const outputDigest = digestDirectory(path.join(repo, sampleRelative), owner.outputDigestExcludes); if (outputDigest !== result.outputDigest) throw new SyncError("Applied sample output digest differs from validated result"); const state = readJson<State>(path.join(repo, stateRelative)); validateState(state, sample); if (stable(state) !== stable(result.state) || state.outputDigest !== outputDigest || state.upstreamCommit !== result.upstreamCommit || state.sourceTree !== result.sourceTree || state.inputDigest !== result.inputDigest || hash(stable(state.componentDigests)) !== hash(stable(result.componentDigests))) throw new SyncError("Applied state differs from validated result");
}

export async function main(argv = process.argv.slice(2)): Promise<number> { try { const [command, ...rest] = argv; if (command !== "plan" && command !== "migrate" && command !== "verify-patch") throw new SyncError("Expected command: plan, migrate, or verify-patch"); const values = parseArgs(rest); const repo = path.resolve(process.env.INIT_CWD ?? process.cwd(), values["repo-root"] ?? "."); if (command === "plan") { writeJson(resolveOption(required(values, "output")), createPlan(repo, resolveOption(required(values, "upstream-root")), values.sample)); return 0; } if (command === "migrate") return migrate(repo, values); verifyPatch(repo, values); return 0; } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); return 2; } }
const entry = process.argv[1] ? path.resolve(process.argv[1]) : undefined; if (entry && import.meta.url === pathToFileURL(entry).href) process.exitCode = await main();
