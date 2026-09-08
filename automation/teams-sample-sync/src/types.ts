export interface ManifestTarget {
  distribution: string;
  packageDirectory: string;
  placeholderConvention: string;
}

export interface Target {
  source: string;
  destination: string;
  manifest: ManifestTarget;
}

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export interface CopilotConfiguration {
  model: string;
  reasoningEffort?: ReasoningEffort;
}

export interface Targets {
  version: 1;
  upstream: { repository: string; ref: string; root: string };
  destinationRoot: string;
  canonicalSample: string;
  migrationSkill: string;
  manifestSkill: string;
  copilot: CopilotConfiguration;
  packagePolicy: { targetFramework: string; agentsSdkVersion: string };
  validatorVersion: string;
  samples: Record<string, Target>;
}

export interface MigrationPolicy {
  key: string;
  sample: string;
  instruction: string;
  rationale: string;
  source: string;
}

export interface Protection {
  version: 1;
  protectedPaths: string[];
  outputDigestExcludes: string[];
}

export interface State {
  version: 2;
  sample: string;
  upstreamCommit: string;
  sourceTree: string;
  inputDigest: string;
  outputDigest: string;
  componentDigests: Record<string, string>;
  status: "verified";
}

export type PlanStatus = "unchanged" | "pending" | "upstream-removed";

export interface PlanSample {
  status: PlanStatus;
  upstreamCommit?: string;
  sourceTree?: string;
  inputDigest?: string;
  componentDigests?: Record<string, string>;
  changedComponents: string[];
  previousState?: unknown;
}

export interface Plan {
  version: 2;
  upstreamCommit: string;
  samples: Record<string, PlanSample>;
  matrix: Array<{ sample: string; upstreamCommit: string }>;
  newSampleCandidates: Array<{ sample: string; status: "new-sample-candidate" }>;
}

export interface UpstreamChange {
  status: "added" | "modified" | "deleted" | "renamed";
  oldPath: string | null;
  newPath: string | null;
  binary: boolean;
}

export interface SyncContext {
  version: 1;
  mode: "initial" | "incremental";
  changes: SourceEvidence[];
  skills: { migration: string; manifest: string };
  feedback?: { implementation: AgentResult; review?: ReviewResult };
  sample: string;
  upstream: {
    repository: string;
    sourcePath: string;
    previousCommit: string | null;
    currentCommit: string;
    previousTree: string | null;
    currentTree: string;
    initialImport: boolean;
    changes: UpstreamChange[];
  };
  paths: {
    previousUpstream: string;
    currentUpstream: string;
    destination: string;
  };
  migration: Targets["packagePolicy"] & { canonicalSample: string };
  manifest: ManifestTarget;
  policies: MigrationPolicy[];
  protectedPaths: string[];
  validationErrors?: string[];
}

export interface SourceEvidence {
  id: string;
  path: string;
  diff: string;
}

export interface ChangeDisposition {
  changeId: string;
  decision: "adapted" | "already-present" | "not-applicable" | "blocked";
  explanation: string;
  destinationPath: string;
  symbol: string;
  verification: string;
}

export interface ReviewResult {
  version: 1;
  sample: string;
  verdict: "approved" | "changes-required" | "blocked";
  summary: string;
  reviewedChangeIds: string[];
  manifestAssessment: string;
  testAssessment: string;
  resolvedFindingIds: string[];
  findings: Array<{ id: string; source: string; destination: string; expectedBehavior: string; correction: string }>;
}

export interface ReviewApproval {
  result: ReviewResult;
  outputDigest: string;
}

export type AgentStatus = "updated" | "unchanged" | "needs-policy" | "unsupported";

export interface PolicyRequest {
  key: string;
  question: string;
  recommendation: string;
  evidence: string;
  impact: string;
  suggestedPolicy: { instruction: string; rationale: string };
}

export interface AgentResult {
  version: 1;
  sample: string;
  status: AgentStatus;
  summary: string;
  dispositions?: ChangeDisposition[];
  upstreamChanges: unknown[];
  preservedDifferences: unknown[];
  appliedPolicies: string[];
  manifestReport: {
    mode: string;
    changes: unknown[];
    validation: unknown[];
    externalSetup: unknown[];
  };
  policyRequest?: PolicyRequest;
}

export interface ValidationChecks {
  project: boolean;
  restore: boolean;
  build: boolean;
  manifest: boolean;
  httpSmoke: boolean;
  contracts: boolean | null;
}

export interface ValidationResult {
  version: 1;
  sample: string;
  passed: boolean;
  repairable: boolean;
  outputDigest: string;
  checks: ValidationChecks;
  errors: string[];
  externalValidationRequired: string[];
}

export interface SyncResult {
  version: 2;
  sample: string;
  status: AgentStatus | "failed";
  publishable: boolean;
  baseSha: string;
  previousUpstreamCommit: string | null;
  upstreamCommit: string;
  upstreamChanges: UpstreamChange[];
  changedComponents: string[];
  copilot: CopilotConfiguration;
  migrationPolicies: MigrationPolicy[];
  destinationChanges?: string[];
  sourceTree: string;
  inputDigest: string;
  outputDigest?: string;
  componentDigests: Record<string, string>;
  state?: State;
  agent?: AgentResult;
  validation?: ValidationResult;
  error?: string;
  sourceRepository?: string;
  review?: ReviewApproval;
  cycles?: number;
  failureStage?: "evidence" | "review";
}
