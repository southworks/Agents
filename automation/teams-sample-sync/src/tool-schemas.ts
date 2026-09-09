import type { Tool } from "@github/copilot-sdk";

const text = { type: "string", minLength: 1 };
const evidenceItems = { type: "array", items: { anyOf: [{ type: "string", minLength: 1 }, { type: "object" }] } };
const strings = { type: "array", items: text, uniqueItems: true };
const object = (properties: Record<string, unknown>, optional: string[] = []): Record<string, unknown> => ({ type: "object", additionalProperties: false, required: Object.keys(properties).filter((key) => !optional.includes(key)), properties });
const array = (items: Record<string, unknown>): Record<string, unknown> => ({ type: "array", items });

const completedImplementation = object({
  version: { const: 2 }, sample: text, status: { enum: ["updated", "unchanged", "needs-policy", "unsupported"] }, summary: text,
  dispositions: array(object({ changeId: text, decision: { enum: ["adapted", "already-present", "not-applicable", "blocked"] }, explanation: text, destinationPath: { ...text, description: "Repository-relative existing destination file, including samples/dotnet/teams/<sample>/, with forward slashes. Required for adapted/already-present." }, symbol: text, verification: text })),
  upstreamChanges: evidenceItems, preservedDifferences: evidenceItems, appliedPolicies: strings,
  manifestReport: object({ mode: text, changes: evidenceItems, validation: evidenceItems, externalSetup: evidenceItems, capabilities: { ...array(object({ id: { ...text, pattern: "^[a-z0-9][a-z0-9:._-]*$" }, kind: text, evidence: { ...strings, minItems: 1 }, decision: { enum: ["manifest-field-required", "no-manifest-field", "needs-input", "unsupported"] }, manifestPath: { ...text, description: 'Concrete path such as bots[0].supportsTargetedMessages for manifest-field-required; otherwise the literal string "none".' }, reference: text })) } }),
  policyRequest: object({ key: text, question: text, recommendation: text, evidence: text, impact: text, suggestedPolicy: object({ instruction: text, rationale: text }) }),
}, ["policyRequest"]);

// A non-migration result is an explanation for a human decision, not a claim
// that the agent completed a full migration. Keep it deliberately small.
const blockedImplementation = object({
  version: { const: 2 }, sample: text, status: { enum: ["needs-policy", "unsupported"] }, summary: text,
  policyRequest: object({ key: text, question: text, recommendation: text, evidence: text, impact: text, suggestedPolicy: object({ instruction: text, rationale: text }) }),
}, ["policyRequest"]);

export const implementationSchema = { anyOf: [completedImplementation, blockedImplementation] } as NonNullable<Tool["parameters"]>;

export const reviewSchema = object({
  version: { const: 2 }, sample: text, verdict: { enum: ["approved", "changes-required", "blocked"] }, summary: text,
  reviewedChangeIds: strings, reviewedCapabilityIds: strings,
  findings: array(object({ id: text, category: { enum: ["code", "manifest", "test", "evidence"] }, source: text, destination: text, expectedBehavior: text, correction: text })),
  resolvedFindingIds: strings, testAssessment: text, coverageLimitations: strings, blockerReason: text,
}, ["blockerReason"]) as NonNullable<Tool["parameters"]>;
