import { SyncError } from "./config.js";
import type { ModelPolicy } from "./types.js";

// Fields from the pinned SDK's ModelInfo; optional metadata permits conservative handling.
export interface ModelInfo {
  id: string;
  policy?: { state?: "enabled" | "disabled" | "unconfigured" };
  capabilities?: { supports?: { reasoningEffort?: boolean }; limits?: { max_prompt_tokens?: number; max_context_window_tokens?: number } };
  billing?: { multiplier?: number };
  supportedReasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}
export interface ModelSelection { model: string; reasoningEffort?: string; reason: string; }
const finitePositive = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value > 0;
const cost = (model: ModelInfo): number | undefined => {
  const value = model.billing?.multiplier;
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
};

export function selectModel(policy: ModelPolicy, models: ModelInfo[]): ModelSelection {
  if (policy.strategy === "auto") return { model: "auto", reason: "Configured Auto routing; no forced reasoning effort" };
  const desired = policy.preferredReasoningEffort ?? "high";
  const eligible = models.filter((model) => {
    if (!model.id.trim() || model.policy?.state !== "enabled") return false;
    const capabilities = model.capabilities;
    // Input capacity is distinct from the total window, which also contains output.
    if (policy.minimumContextTokens !== undefined) {
      const input = capabilities?.limits?.max_prompt_tokens;
      if (!finitePositive(input) || input < policy.minimumContextTokens) return false;
    }
    if (policy.requireReasoning && !capabilities?.supports?.reasoningEffort) return false;
    const multiplier = cost(model);
    if (policy.maximumCostMultiplier !== undefined && (multiplier === undefined || multiplier > policy.maximumCostMultiplier)) return false;
    if (policy.requireReasoning && !model.supportedReasoningEfforts?.includes(desired)) return false;
    return true;
  });
  // Prefer the requested effort before comparing cost. An optional policy may use
  // an advertised default only after all candidates with the preference are exhausted.
  const preference = (model: ModelInfo): number => model.capabilities?.supports?.reasoningEffort && model.supportedReasoningEfforts?.includes(desired) ? 0 : 1;
  eligible.sort((left, right) => preference(left) - preference(right) || (cost(left) ?? Infinity) - (cost(right) ?? Infinity) || left.id.localeCompare(right.id));
  const selected = eligible[0];
  if (!selected) {
    if (policy.fallback === "auto") return { model: "auto", reason: "No model advertises all required policy, input capacity, reasoning, and billing metadata; explicit Auto fallback" };
    throw new SyncError("No model satisfies the configured capability policy and required reasoning effort");
  }
  if (selected.capabilities?.supports?.reasoningEffort) {
    if (selected.supportedReasoningEfforts?.includes(desired)) return { model: selected.id, reasoningEffort: desired, reason: "Selected advertised preferred reasoning effort, then cost and ID" };
    if (selected.defaultReasoningEffort && selected.supportedReasoningEfforts?.includes(selected.defaultReasoningEffort)) {
      return { model: selected.id, reasoningEffort: selected.defaultReasoningEffort, reason: "Preferred effort unavailable; optional reasoning policy permits advertised default" };
    }
  }
  return { model: selected.id, reason: "Selected eligible model; optional reasoning metadata unavailable, so effort is omitted" };
}
