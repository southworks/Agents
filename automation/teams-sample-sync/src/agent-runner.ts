import { appendFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CopilotClient, RuntimeConnection, type CopilotSession, type PermissionRequest, type PermissionRequestResult, type SessionConfig, type Tool } from "@github/copilot-sdk";
import { selectModel, type ModelInfo } from "./model-selection.js";
import { SyncError } from "./config.js";
import type { CopilotConfiguration, ObservedModel } from "./types.js";
import type { PersistentSession } from "./sync-session.js";

export type SdkSession = Pick<CopilotSession, "sendAndWait" | "on" | "disconnect" | "abort">;
export type SdkClient = Pick<CopilotClient, "start" | "stop" | "listModels" | "getStatus" | "getAuthStatus"> & {
  createSession(config: SessionConfig): Promise<SdkSession>;
};
export type SdkFactory = () => Promise<SdkClient>;

export function createCopilotLog(artifact: (value: string) => void, console: (value: string) => void) {
  let lineStart = true;
  return { write(value: string): void { artifact(value); for (const part of value.split(/(?<=[\r\n])/)) { if (!part) continue; console((lineStart ? "[Copilot] " : "") + part); lineStart = /[\r\n]$/.test(part); } }, finish(): void { if (!lineStart) console("\n"); } };
}

export async function defaultSdkFactory(): Promise<SdkClient> {
  // SDK 1.0.7's automatic discovery expects an /sdk export absent from CLI
  // 1.0.83. Resolve the platform package's public executable export instead.
  const executable = fileURLToPath(import.meta.resolve(`@github/copilot-${process.platform}-${process.arch}`));
  return new CopilotClient({ connection: RuntimeConnection.forStdio({ path: executable }) });
}

export function permissionFor(repo: string, sampleRoot: string, readOnly: boolean, request: PermissionRequest): PermissionRequestResult {
  if (request.kind === "read") {
    try {
      const root = realpathSync(repo);
      const candidate = realpathSync(path.resolve(repo, request.path));
      const relative = path.relative(root, candidate);
      const segments = relative.split(path.sep);
      return { kind: (candidate === root || (!relative.startsWith("..") && !path.isAbsolute(relative))) && !segments.includes(".git") && !segments.includes(".codex") ? "approve-once" : "reject" };
    } catch { return { kind: "reject" }; }
  }
  if (request.kind === "url") {
    try {
      const url = new URL(request.url);
      const official = ["learn.microsoft.com", "developer.microsoft.com", "docs.github.com", "github.com", "raw.githubusercontent.com", "www.nuget.org", "api.nuget.org"];
      return { kind: url.protocol === "https:" && official.includes(url.hostname) && !url.username && !url.password ? "approve-once" : "reject" };
    } catch { return { kind: "reject" }; }
  }
  if (request.kind === "custom-tool") {
    const allowed = readOnly ? ["inspect_manifest_schema", "submit_review"] : ["validate_sample", "inspect_manifest_schema", "submit_result"];
    return { kind: allowed.includes(request.toolName) ? "approve-once" : "reject" };
  }
  if (readOnly || request.kind !== "write" || request.requestSandboxBypass) return { kind: "reject" };
  try {
    const root = realpathSync(path.join(repo, sampleRoot));
    const candidate = path.resolve(repo, request.fileName);
    if (path.relative(root, candidate).split(path.sep).some((part) => [".git", ".codex", ".agents"].includes(part))) return { kind: "reject" };
    // Resolve the closest existing ancestor so creation of nested directories works,
    // while symlinks leading outside the selected sample remain forbidden.
    let ancestor = candidate;
    while (!existsSync(ancestor)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) return { kind: "reject" };
      ancestor = parent;
    }
    const resolved = path.resolve(realpathSync(ancestor), path.relative(ancestor, candidate));
    return { kind: resolved.startsWith(root + path.sep) ? "approve-once" : "reject" };
  } catch { return { kind: "reject" }; }
}

class CopilotPersistentSession implements PersistentSession {
  private submitted: unknown;
  private failure: Error | undefined;
  constructor(private readonly session: SdkSession, private readonly log: ReturnType<typeof createCopilotLog>, role: "implementation" | "review", observed: ObservedModel[]) {
    session.on("assistant.message", (event) => { const data = event as { data?: { content?: unknown } }; if (typeof data.data?.content === "string") log.write(data.data.content); });
    session.on("assistant.usage", (event) => {
      if (event.data.model) observed.push({ role, model: event.data.model, reasoningEffort: event.data.reasoningEffort ?? "unknown" });
    });
  }
  setSubmission(value: unknown): void { this.submitted = value; }
  fail(error: Error): void {
    this.failure = error;
    void this.session.abort().catch(() => {});
  }
  async send(message: string): Promise<unknown> {
    if (this.failure) throw this.failure;
    this.submitted = undefined;
    // send() returns an acknowledgement before the agent has called its tools.
    // The coordinator owns the overall deadline and aborts an overlong turn.
    try { await this.session.sendAndWait({ prompt: message }, 30 * 60_000); }
    catch (error) { throw this.failure ?? error; }
    if (this.failure) throw this.failure;
    return this.submitted;
  }
  async abort(): Promise<void> { await this.session.abort(); }
  async close(): Promise<void> { this.log.finish(); await this.session.disconnect(); }
}

export class CopilotAgentRunner {
  private client: SdkClient | undefined;
  constructor(private readonly repo: string, private readonly sampleRoot: string, private readonly configuration: CopilotConfiguration, private readonly logFile: string, private readonly observed: ObservedModel[], private readonly skillDirectories: string[], private readonly factory: SdkFactory = defaultSdkFactory, private readonly isValidationActive: () => boolean = () => false, private readonly guard: () => void = () => {}) {}
  async open(role: "implementation" | "review", tools: Tool[] = []): Promise<PersistentSession> {
    if (!this.client) {
      const client = await this.factory();
      try {
        await client.start();
        const status = await client.getStatus();
        if (status.version !== this.configuration.runtimeVersion) throw new SyncError(`Copilot runtime version mismatch: expected ${this.configuration.runtimeVersion}, received ${status.version}`);
        const auth = await client.getAuthStatus();
        if (!auth.isAuthenticated) throw new SyncError("Copilot runtime is not authenticated");
        this.client = client;
      } catch (error) {
        await client.stop().catch(() => {});
        throw error;
      }
    }
    const policy = role === "implementation" ? this.configuration.implementation : this.configuration.review;
    const log = createCopilotLog((value) => appendFileSync(this.logFile, value, "utf8"), (value) => process.stdout.write(value));
    // Auto routing does not need the catalog. Actions tokens can authorize
    // inference while being rejected by the models.list endpoint.
    let models: ModelInfo[] = [];
    if (policy.strategy === "capability") {
      try { models = await this.client.listModels(); }
      catch (error) {
        if (policy.fallback !== "auto") {
          throw new SyncError(`Copilot model discovery failed for ${role}; capability fallback is fail: ${error instanceof Error ? error.message : String(error)}`);
        }
        log.write(`Model discovery unavailable for ${role}; using configured Auto fallback without forced reasoning effort.\n`);
      }
    }
    const selection = selectModel(policy, models);
    const prompt = readFileSync(path.join(this.repo, "automation/teams-sample-sync/prompts", role === "implementation" ? "agent-prompt.md" : "review-prompt.md"), "utf8");
    let active: CopilotPersistentSession | undefined;
    const rejected = new Map<string, { signature: string; count: number }>();
    const wrappedTools: Tool[] = tools.map((tool) => ({ ...tool, handler: async (input, invocation) => {
      if (!tool.handler) throw new SyncError(`Tool ${tool.name} has no handler`);
      try {
        const output = await tool.handler(input, invocation);
        if (tool.name === "submit_result" || tool.name === "submit_review") {
          rejected.delete(tool.name);
          active?.setSubmission(output);
        }
        return output;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.write(`\nTool ${tool.name} rejected: ${message}\n`);
        if (/changed (?:protected|outside|Git HEAD|candidate|during)|Validation changed|infrastructure failed|Cannot run |schema is unavailable|timed out/i.test(message)) {
          active?.fail(error instanceof Error ? error : new SyncError(message));
        } else if (tool.name === "submit_result" || tool.name === "submit_review") {
          const signature = JSON.stringify([input, message]);
          const previous = rejected.get(tool.name);
          const count = previous?.signature === signature ? previous.count + 1 : 1;
          rejected.set(tool.name, { signature, count });
          if (count >= 2) active?.fail(new SyncError(`Report correction made no progress: ${message}`));
        }
        throw error;
      }
    } }));
    const names = wrappedTools.map((tool) => String(tool.name));
    const effort = selection.reasoningEffort;
    if (effort !== undefined && effort !== "low" && effort !== "medium" && effort !== "high" && effort !== "xhigh") throw new SyncError(`Pinned SDK does not support reasoning effort: ${effort}`);
    const availableTools = role === "implementation"
      ? ["view", "grep", "glob", "skill", "web_fetch", "edit", "apply_patch", "create", "str_replace_editor", ...names]
      : ["view", "grep", "glob", "skill", "web_fetch", ...names];
    const raw = await this.client.createSession({
      model: selection.model, ...(effort ? { reasoningEffort: effort } : {}),
      workingDirectory: this.repo, skillDirectories: this.skillDirectories,
      systemMessage: { mode: "append", content: prompt }, tools: wrappedTools,
      availableTools,
      excludedTools: ["shell", "bash", "terminal"],
      enableConfigDiscovery: false,
      hooks: { onPreToolUse: (input) => {
        this.guard();
        if (!availableTools.includes(input.toolName)) return { permissionDecision: "deny", permissionDecisionReason: "Tool is outside this session's allowed capabilities" };
        if (this.isValidationActive() && ["edit", "apply_patch", "create", "str_replace_editor"].includes(input.toolName)) return { permissionDecision: "deny", permissionDecisionReason: "Wait for candidate validation to complete before editing" };
        return undefined;
      }, onPostToolUse: () => { this.guard(); } },
      onPermissionRequest: (request) => request.kind === "write" && this.isValidationActive()
        ? { kind: "reject" }
        : permissionFor(this.repo, this.sampleRoot, role === "review", request),
    });
    active = new CopilotPersistentSession(raw, log, role, this.observed);
    return active;
  }
  async close(): Promise<void> { if (this.client) { await this.client.stop(); this.client = undefined; } }
}
