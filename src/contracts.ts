import type { BrainaryTool, ModelSpec } from "@brainary/poa-sdk";
import type { Monitoring, RsiDecision } from "./monitoring.js";

import type {
  EvaluationTag,
  ExperienceProvenance,
  GeneratorStrategy,
} from "./rsi/contracts.js";

export interface ManusConfig {
  model: ModelSpec;
  availableTools: BrainaryTool[];
  agentTimeoutMs: number;
  artifactRoot: string;
}
export interface TaskMethod {
  objective: string;
  scenario: "text" | "order-audit";
  inputKind: "text" | "csv";
}
export interface RunInput {
  source: string;
  content: string;
  sha256: string;
}
export interface KnowledgeRule {
  id: string;
  statement: string;
}
export interface DomainKnowledge {
  id: string;
  version: string;
  source: string;
  scenario: TaskMethod["scenario"];
  concepts: string[];
  relations: string[];
  rules: KnowledgeRule[];
  methods: string[];
}
export interface Experience {
  applicability?: string;
  provenance?: ExperienceProvenance;
  id: string;
  version: string;
  scenario: TaskMethod["scenario"];
  content: string;
  source: string;
}
export interface Episode {
  runId: string;
  assetId: string;
  scenario: string;
  objective: string;
  status: string;
  summary: string;
  source: string;
  finishedAt: string | null;
}
export interface TaskContext {
  domain: DomainKnowledge | null;
  experiences: Experience[];
  episodes: Episode[];
  selection: string;
}
export interface ExecutionInput {
  request: string;
  method: TaskMethod;
  material: { kind: "text" | "csv"; value: string };
  context: TaskContext;
}
export interface AgentDefinition {
  id: string;
  name: string;
  systemPrompt: string;
  knowledge: string[];
  tools: BrainaryTool[];
}
export interface ExecutionStep {
  id: string;
  agentId: string;
  instruction: string;
  inputFrom: string[];
  acceptanceCriteria: string[];
  knowledgeRefs: string[];
  maxRevisions: 0 | 1;
}
export interface GeneratedBundle {
  version: 1;
  summary: string;
  agents: AgentDefinition[];
  steps: ExecutionStep[];
}
export interface AgentReply {
  agentId: string;
  text: string;
  toolReceipts?: ToolReceipt[];
}
export type AgentRunner = (
  definition: AgentDefinition,
  message: string,
) => Promise<AgentReply>;
export interface Review {
  passed: boolean;
  feedback: string;
}
export interface AttemptRecord {
  agentId: string;
  output: string;
  reviewerId: string;
  review: Review;
}
export interface StepRecord {
  stepId: string;
  attempts: AttemptRecord[];
  status: "passed" | "failed";
}
export interface ExecutionResult {
  status: "completed" | "failed";
  steps: StepRecord[];
  finalOutput: string | null;
}
export interface Check {
  id: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
}
export interface Acceptance {
  passed: boolean;
  kind: "objective" | "model-only";
  checks: Check[];
}
export interface RuntimeConditions {
  node: string;
  platform: string;
  arch: string;
  cwd: string;
  model: ModelSpec;
  sdkVersion: string;
  requiredBrainary: string;
  tools: BrainaryTool[];
}
export interface RunRecord {
  monitoring?: Monitoring;
  rsi?: RsiDecision;
  version: 2;
  runId: string;
  assetId: string;
  mode: "generate" | "new" | "replay" | "evaluate";
  evaluation?: EvaluationTag;
  generationStrategy?: GeneratorStrategy;
  status: "running" | "completed" | "failed" | "error";
  startedAt: string;
  finishedAt: string | null;
  config: ManusConfig;
  method: TaskMethod;
  request: string;
  input: RunInput | null;
  context: TaskContext | null;
  bundle: GeneratedBundle | null;
  execution: ExecutionResult | null;
  acceptance: Acceptance | null;
  conditions: RuntimeConditions;
  error: string | null;
  generatorVersion: string;
  executorVersion: string;
}
export interface Dependencies {
  brainary: string;
  sdk: string;
  node: string;
  modelConfiguration: ModelSpec;
  tools: BrainaryTool[];
  externalServices: string[];
  resources: string[];
}
export interface TaskAsset {
  generationStrategy?: GeneratorStrategy;
  lineage?: { parentAssetId: string; sourceRunIds: string[]; cycleId: string };
  version: 2;
  assetId: string;
  createdAt: string;
  method: TaskMethod;
  config: ManusConfig;
  bundle: GeneratedBundle;
  domain: DomainKnowledge | null;
  dependencies: Dependencies;
  generatorVersion: string;
  executorVersion: string;
}
export interface Verification {
  runId: string;
  input: RunInput;
  status: RunRecord["status"];
  executionStatus: ExecutionResult["status"] | null;
  acceptance: Acceptance | null;
  conditions: RuntimeConditions;
  finishedAt: string | null;
}
export interface TaskPackage {
  asset: TaskAsset;
  originalRequest: string;
  originalInput: RunInput;
  resources: Record<string, string>;
  experiences: Experience[];
  verification: Verification[];
}
export interface ToolReceipt {
  callId: string;
  agentId: string;
  runId: string;
  assetId: string;
  operation: "read" | "write";
  args: Record<string, unknown>;
  startedAt: string;
  finishedAt: string;
  status: "completed" | "error";
  result: Record<string, unknown> | null;
  error: string | null;
}
export interface AgentRunContext {
  scenario: TaskMethod["scenario"];
  runId: string;
  assetId: string;
  runDirectory: string;
  inputPath: string;
  inputIsSnapshot: boolean;
  sourceRoot: string;
  toolScript: string;
}
export interface TraceEvent {
  type: string;
  [field: string]: unknown;
}
export type TraceSink = (event: TraceEvent) => Promise<void>;
