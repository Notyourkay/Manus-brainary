import type { BrainaryTool, ModelSpec } from "@brainary/poa-sdk";

export interface ManusConfig {
  model: ModelSpec;
  availableTools: BrainaryTool[];
  agentTimeoutMs: number;
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
  task: TaskRequest;
  bundle: GeneratedBundle;
  execution: ExecutionResult;
}
