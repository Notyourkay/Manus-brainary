import type {
  Experience,
  GeneratedBundle,
  RunInput,
  RunRecord,
  TaskContext,
  TaskMethod,
  TaskPackage,
} from "../contracts.js";

export interface GeneratorStrategy {
  id: string;
  parentId: string | null;
  scenario: TaskMethod["scenario"];
  instructions: string;
  sourceRunIds: string[];
  createdAt: string;
}
export interface EvaluationTag {
  cycleId: string;
  target: "inner" | "outer";
  arm: "baseline" | "candidate";
  caseId: string;
}
export interface ExperienceProvenance {
  status: "validated";
  cycleId: string;
  sourceRunIds: string[];
  evaluationRunIds: string[];
  caseIds: string[];
  scope: string;
}
export interface LearningState {
  version: 1;
  strategies: Partial<Record<TaskMethod["scenario"], GeneratorStrategy>>;
  experiences: Experience[];
}
export interface Reflection {
  diagnosis: string;
  sourceRunIds: string[];
  experiences: { content: string; applicability: string }[];
  innerBundle: GeneratedBundle;
  strategyInstructions: string;
}
export interface RsiSource {
  directory: string;
  record: RunRecord;
  pkg: TaskPackage;
  hashes: Record<string, string>;
  toolReceipts: unknown[];
  agentCalls: number;
}
export interface EvaluationCase {
  id: string;
  request: string;
  input: RunInput;
}
export interface EvaluationRow {
  caseId: string;
  inputSha256: string;
  requestSha256: string;
  runId: string;
  assetId: string;
  runDirectory: string;
  conditions: Record<string, unknown>;
  passed: boolean;
  acceptanceKind: string | null;
  checksPassed: number;
  checksTotal: number;
  agentCalls: number;
  toolCalls: number;
  elapsedMs: number;
  error: string | null;
}
export interface Comparison {
  adopted: boolean;
  reason: string;
  baseline: EvaluationRow[];
  candidate: EvaluationRow[];
  totals: {
    baselinePassed: number;
    candidatePassed: number;
    baselineCalls: number;
    candidateCalls: number;
  };
}
export interface CycleResult {
  version: 1;
  cycleId: string;
  sourceRunId: string;
  status: "completed";
  inner: Comparison;
  outer: Comparison;
  selectedAssetId: string;
  selectedStrategyId: string;
  selectedPackage: string;
  publishedExperienceIds: string[];
  humanAcceptance: "pending";
}
export interface FrozenEvaluation {
  cycleId: string;
  sourceRunId: string;
  context: TaskContext;
  resources: Record<string, string>;
}

export function defaultStrategy(
  scenario: TaskMethod["scenario"],
): GeneratorStrategy {
  return {
    id: `builtin-${scenario}-v2`,
    parentId: null,
    scenario,
    instructions: "",
    sourceRunIds: [],
    createdAt: "2026-11-13T00:00:00Z",
  };
}
