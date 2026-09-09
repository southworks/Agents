export interface ManifestTarget { distribution: string; packageDirectory: string; placeholderConvention: string; }
export interface Target { source: string; destination: string; manifest: ManifestTarget; }

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];
export type ModelStrategy = "auto" | "explicit" | "capability";
export interface ModelPolicy { strategy: ModelStrategy; model?: string; reasoningEffort?: ReasoningEffort; minimumContextTokens?: number; preferredReasoningEffort?: ReasoningEffort; requireReasoning?: boolean; maximumCostMultiplier?: number; fallback?: "auto" | "fail"; }
export interface CopilotConfiguration { implementation: ModelPolicy; review: ModelPolicy; sdkVersion: string; runtimeVersion: string; }
export interface Targets { version: 1; upstream: { repository: string; ref: string; root: string }; destinationRoot: string; canonicalSample: string; migrationSkill: string; manifestSkill: string; copilot: CopilotConfiguration; packagePolicy: { targetFramework: string; agentsSdkVersion: string }; validatorVersion: string; samples: Record<string, Target>; }
export interface MigrationPolicy { key: string; sample: string; instruction: string; rationale: string; source: string; }
export interface Protection { version: 1; protectedPaths: string[]; outputDigestExcludes: string[]; }
export interface State { version: 2; sample: string; upstreamCommit: string; sourceTree: string; inputDigest: string; outputDigest: string; componentDigests: Record<string, string>; status: "verified"; }
export type PlanStatus = "unchanged" | "pending" | "upstream-removed";
export interface PlanSample { status: PlanStatus; upstreamCommit?: string; sourceTree?: string; inputDigest?: string; componentDigests?: Record<string, string>; changedComponents: string[]; previousState?: unknown; }
export interface Plan { version: 2; upstreamCommit: string; samples: Record<string, PlanSample>; matrix: Array<{ sample: string; upstreamCommit: string }>; newSampleCandidates: Array<{ sample: string; status: "new-sample-candidate" }>; }
export interface UpstreamChange { status: "added" | "modified" | "deleted" | "renamed"; oldPath: string | null; newPath: string | null; binary: boolean; }
export interface SourceEvidence { id: string; path: string; diff: string; }
export interface SyncContext { version: 1; mode: "initial" | "incremental"; changes: SourceEvidence[]; skills: { migration: string; manifest: string }; sample: string; upstream: { repository: string; sourcePath: string; previousCommit: string | null; currentCommit: string; previousTree: string | null; currentTree: string; initialImport: boolean; changes: UpstreamChange[]; }; paths: { previousUpstream: string; currentUpstream: string; destination: string }; migration: Targets["packagePolicy"] & { canonicalSample: string }; manifest: ManifestTarget; policies: MigrationPolicy[]; protectedPaths: string[]; }
export interface ChangeDisposition { changeId: string; decision: "adapted" | "already-present" | "not-applicable" | "blocked"; explanation: string; destinationPath: string; symbol: string; verification: string; }
export type ManifestCapabilityDecisionKind = "manifest-field-required" | "no-manifest-field" | "needs-input" | "unsupported";
export interface ManifestCapabilityDecision { id: string; kind: string; evidence: string[]; decision: ManifestCapabilityDecisionKind; manifestPath: string; reference: string; }
export type AgentStatus = "updated" | "unchanged" | "needs-policy" | "unsupported";
export interface PolicyRequest { key: string; question: string; recommendation: string; evidence: string; impact: string; suggestedPolicy: { instruction: string; rationale: string }; }
export interface AgentResult { version: 2; sample: string; status: AgentStatus; summary: string; dispositions: ChangeDisposition[]; upstreamChanges: unknown[]; preservedDifferences: unknown[]; appliedPolicies: string[]; manifestReport: { mode: string; changes: unknown[]; validation: unknown[]; externalSetup: unknown[]; capabilities: ManifestCapabilityDecision[]; }; policyRequest?: PolicyRequest; }
export type CheckStatus = "passed" | "failed" | "skipped" | "not-run";
export interface ValidationCheck { status: CheckStatus; errors: string[]; output?: string; }
export interface ValidationResult { version: 2; id: string; sample: string; passed: boolean; repairable: boolean; outputDigest: string; group: "code" | "manifest" | "all"; checks: Record<string, ValidationCheck>; errors: string[]; externalValidationRequired: string[]; }
export interface ReviewFinding { id: string; category: "code" | "manifest" | "test" | "evidence"; source: string; destination: string; expectedBehavior: string; correction: string; }
export interface ReviewResult { version: 2; sample: string; verdict: "approved" | "changes-required" | "blocked"; summary: string; reviewedChangeIds: string[]; reviewedCapabilityIds: string[]; findings: ReviewFinding[]; resolvedFindingIds: string[]; testAssessment: string; coverageLimitations: string[]; blockerReason?: string; }
export interface ReviewApproval { result: ReviewResult; outputDigest: string; evidenceDigest: string; validationId: string; }
export type SyncStage = "preflight" | "inspect" | "migrate-code" | "reconcile-manifest" | "validate" | "review" | "repair" | "complete" | "blocked" | "failed";
export interface AgentEvent { at: string; stage: SyncStage; type: string; detail: Record<string, unknown>; }
export interface SyncMetrics { repairPasses: number; rejectedImplementerReports: number; rejectedReviewerReports: number; }
export interface ObservedModel { role: "implementation" | "review"; model: string; reasoningEffort: string; }
export type PublicationKind = "update" | "report";
export interface SyncResult { version: 3; sample: string; status: AgentStatus | "failed"; publishable: boolean; publicationKind?: PublicationKind; reportPath?: string; baseSha: string; previousUpstreamCommit: string | null; upstreamCommit: string; upstreamChanges: UpstreamChange[]; changedComponents: string[]; copilot: CopilotConfiguration; observedModels: ObservedModel[]; migrationPolicies: MigrationPolicy[]; sourceTree: string; sourceContextDigest: string; inputDigest: string; componentDigests: Record<string, string>; destinationChanges?: string[]; outputDigest?: string; evidenceDigest?: string; state?: State; agent?: AgentResult; validation?: ValidationResult; review?: ReviewApproval; metrics: SyncMetrics; failureStage?: SyncStage; failureClass?: string; error?: string; sourceRepository?: string; diagnostics: string[]; }
