import type { Review } from "./contracts.js";

export type Checkpoint = "plan_completed" | "step_completed" | "task_completed";
export interface GenerationState {
  status:
    | "pending"
    | "understanding"
    | "awaiting_input"
    | "generating"
    | "generated"
    | "failed"
    | "reused";
  pendingQuestion: string;
  note: string;
  evidenceRef: string;
}
export type ExecutionStatus =
  | "pending"
  | "running"
  | "checking"
  | "retrying"
  | "between_steps"
  | "completed"
  | "failed"
  | "error";
export interface CognitiveReview extends Review {
  coverage: {
    goal: string;
    status: "planned" | "satisfied" | "missing";
    evidenceRefs: string[];
  }[];
  progress: string;
  problems: {
    kind: "gap" | "failure" | "redundancy";
    detail: string;
    evidenceRefs: string[];
  }[];
}
export interface CognitiveCheck {
  id: string;
  checkpoint: Checkpoint;
  stepId: string;
  attempt: number;
  reviewerId: string;
  wmRef: string;
  evidenceRef: string;
  resultRef: string;
  review: CognitiveReview;
}
export interface Monitoring {
  executionStatus?: ExecutionStatus;
  checkpoint: Checkpoint | "check_failed" | "pending";
  activeStep: string;
  attempt: number;
  outputRef: string;
  reportRef: string;
  toolCalls: number;
  toolErrors: number;
  revisions: number;
  checks: CognitiveCheck[];
}
export interface RsiDecision {
  status:
    | "pending"
    | "skipped"
    | "recommended"
    | "running"
    | "completed"
    | "error";
  eligible: boolean;
  reasons: string[];
  sourceChecks: string[];
  cycleId: string;
  directory: string;
  error: string;
}

export function emptyMonitoring(): Monitoring {
  return {
    executionStatus: "pending",
    checkpoint: "pending",
    activeStep: "",
    attempt: 0,
    outputRef: "",
    reportRef: "",
    toolCalls: 0,
    toolErrors: 0,
    revisions: 0,
    checks: [],
  };
}
