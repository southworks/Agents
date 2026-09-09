import assert from "node:assert/strict";
import test from "node:test";
import { selectModel, type ModelInfo } from "../../src/model-selection.js";
import type { ModelPolicy } from "../../src/types.js";
const policy: ModelPolicy = { strategy: "capability", requireReasoning: true, preferredReasoningEffort: "high", minimumContextTokens: 100, fallback: "fail" };
const candidate = (id: string, multiplier = 1): ModelInfo => ({ id, policy: { state: "enabled" }, capabilities: { supports: { reasoningEffort: true }, limits: { max_prompt_tokens: 200, max_context_window_tokens: 400 } }, billing: { multiplier }, supportedReasoningEfforts: ["high", "medium"], defaultReasoningEffort: "medium" });
test("Auto does not force effort", () => assert.deepEqual(selectModel({ strategy: "auto" }, []), { model: "auto", reason: "Configured Auto routing; no forced reasoning effort" }));
test("select eligible effort before cost, preserving deterministic ties", () => {
  const cheap = candidate("cheap", 0); cheap.supportedReasoningEfforts = ["medium"];
  assert.equal(selectModel(policy, [cheap, candidate("b", 2), candidate("a", 2)]).model, "a");
  assert.equal(selectModel({ ...policy, requireReasoning: false }, [cheap, candidate("a", 2)]).reasoningEffort, "high");
});
test("unknown and unavailable policies are ineligible", () => {
  for (const state of [undefined, "disabled", "unconfigured"] as const) {
    const model = candidate("x"); if (state) model.policy = { state }; else delete model.policy;
    assert.throws(() => selectModel(policy, [model]), /No model satisfies/);
  }
});
test("input capacity cannot be inferred from total context or nonfinite metadata", () => {
  for (const capacity of [undefined, NaN, Infinity, -1, 99]) {
    const model = candidate("x"); if (capacity === undefined) delete model.capabilities!.limits!.max_prompt_tokens; else model.capabilities!.limits!.max_prompt_tokens = capacity;
    assert.throws(() => selectModel(policy, [model]), /No model satisfies/);
  }
});
test("missing or invalid cost cannot satisfy a cost cap; free advertised models can", () => {
  for (const multiplier of [undefined, NaN, Infinity, -1, 3]) {
    const model = candidate("x"); model.billing = multiplier === undefined ? {} : { multiplier };
    assert.throws(() => selectModel({ ...policy, maximumCostMultiplier: 2 }, [model]), /No model satisfies/);
  }
  assert.equal(selectModel({ ...policy, maximumCostMultiplier: 2 }, [candidate("free", 0)]).model, "free");
});
test("fallback is explicit; optional default must be advertised and supported", () => {
  assert.equal(selectModel({ ...policy, fallback: "auto" }, []).model, "auto");
  assert.throws(() => selectModel(policy, []), /No model satisfies/);
  const model = candidate("x"); model.supportedReasoningEfforts = ["medium"];
  assert.equal(selectModel({ ...policy, requireReasoning: false }, [model]).reasoningEffort, "medium");
  model.defaultReasoningEffort = "high";
  assert.equal(selectModel({ ...policy, requireReasoning: false }, [model]).reasoningEffort, undefined);
  model.capabilities!.supports!.reasoningEffort = false;
  assert.equal(selectModel({ ...policy, requireReasoning: false }, [model]).reasoningEffort, undefined);
});
