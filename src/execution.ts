import type {
  AgentDefinition,
  AgentReply,
  AgentRunner,
  ExecutionInput,
  ExecutionResult,
  ExecutionStep,
  GeneratedBundle,
  Review,
  StepRecord,
  TraceSink,
} from "./contracts.js";

export type StepReviewer = (
  step: ExecutionStep,
  attempt: number,
  reply: AgentReply,
) => Promise<{ review: Review; reviewerId: string }>;

export async function executeBundle(
  task: ExecutionInput,
  bundle: GeneratedBundle,
  runAgent: AgentRunner,
  reviewStep: StepReviewer,
  onStep: (record: StepRecord) => void | Promise<void>,
  trace: TraceSink = async () => {},
  guidance = "",
): Promise<ExecutionResult> {
  const definitions = new Map(bundle.agents.map((agent) => [agent.id, agent]));
  const outputs = new Map<string, string>();
  const records: StepRecord[] = [];
  for (const step of bundle.steps) {
    await trace({ type: "step_started", step });
    const definition = definitions.get(step.agentId) as AgentDefinition;
    const message = stepMessage(task, step, outputs, guidance);
    const record = await executeStep(
      step,
      definition,
      message,
      runAgent,
      reviewStep,
      trace,
    );
    records.push(record);
    await onStep(record);
    if (record.status === "failed") {
      return { status: "failed", steps: records, finalOutput: null };
    }
    outputs.set(step.id, record.attempts[record.attempts.length - 1].output);
  }
  const lastStep = bundle.steps[bundle.steps.length - 1];
  return {
    status: "completed",
    steps: records,
    finalOutput: outputs.get(lastStep.id) as string,
  };
}

function stepMessage(
  task: ExecutionInput,
  step: ExecutionStep,
  outputs: Map<string, string>,
  guidance: string,
): string {
  return JSON.stringify({
    request: task.request,
    planGuidance: guidance,
    method: task.method,
    material: task.material,
    context: task.context,
    instruction: step.instruction,
    inputs: step.inputFrom.map((id) => ({
      stepId: id,
      output: outputs.get(id),
    })),
    acceptanceCriteria: step.acceptanceCriteria,
  });
}

async function executeStep(
  step: ExecutionStep,
  definition: AgentDefinition,
  message: string,
  runAgent: AgentRunner,
  reviewStep: StepReviewer,
  trace: TraceSink,
): Promise<StepRecord> {
  const record: StepRecord = {
    stepId: step.id,
    attempts: [],
    status: "failed",
  };
  let currentMessage = message;
  for (let attempt = 0; attempt <= step.maxRevisions; attempt++) {
    const reply = await runAgent(definition, currentMessage);
    const { review, reviewerId } = await reviewStep(step, attempt + 1, reply);
    await trace({
      type: "step_reviewed",
      stepId: step.id,
      attempt: attempt + 1,
      review,
    });
    record.attempts.push({
      agentId: reply.agentId,
      output: reply.text,
      reviewerId,
      review,
    });
    if (review.passed) {
      record.status = "passed";
      break;
    }
    currentMessage = JSON.stringify({
      request: message,
      previousOutput: reply.text,
      feedback: review.feedback,
    });
    if (attempt < step.maxRevisions) {
      await trace({
        type: "step_revision",
        stepId: step.id,
        feedback: review.feedback,
      });
    }
  }
  return record;
}
