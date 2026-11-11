import type { BrainaryTool, ModelSpec } from "@brainary/poa-sdk";

export interface ManusConfig {
  model: ModelSpec;
  availableTools: BrainaryTool[];
  agentTimeoutMs: number;
  artifactRoot: string;
}

export interface TaskRequest {
  description: string;
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

export interface RunRecord {
  version: 1;
  runId: string;
  assetId: string;
  mode: "generate" | "replay";
  status: "running" | "completed" | "failed" | "error";
  startedAt: string;
  finishedAt: string | null;
  config: ManusConfig;
  task: TaskRequest;
  bundle: GeneratedBundle | null;
  execution: ExecutionResult | null;
  error: string | null;
  generatorVersion: string;
  executorVersion: string;
}

export interface TaskAsset {
  version: 1;
  assetId: string;
  createdAt: string;
  task: TaskRequest;
  config: ManusConfig;
  bundle: GeneratedBundle;
  generatorVersion: string;
  executorVersion: string;
}

export interface TraceEvent {
  type: string;
  [field: string]: unknown;
}

export type TraceSink = (event: TraceEvent) => Promise<void>;
