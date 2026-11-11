import { parseReview, reviewSchema } from "./bundle.js";
import type {
  AgentDefinition,
  AgentRunner,
  ExecutionResult,
  ExecutionStep,
  GeneratedBundle,
  StepRecord,
  TaskRequest,
} from "./contracts.js";

export async function executeBundle(
  task: TaskRequest,
  bundle: GeneratedBundle,
  runAgent: AgentRunner,
  onStep: (record: StepRecord) => void,
): Promise<ExecutionResult> {
  const definitions = new Map(bundle.agents.map((agent) => [agent.id, agent]));
  const outputs = new Map<string, string>();
  const records: StepRecord[] = [];
  for (const step of bundle.steps) {
    const definition = definitions.get(step.agentId) as AgentDefinition;
    const message = stepMessage(task, step, outputs);
    const record = await executeStep(step, definition, message, runAgent);
    records.push(record);
    onStep(record);
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
  task: TaskRequest,
  step: ExecutionStep,
  outputs: Map<string, string>,
): string {
  return JSON.stringify({
    task: task.description,
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
): Promise<StepRecord> {
  const record: StepRecord = {
    stepId: step.id,
    attempts: [],
    status: "failed",
  };
  let currentMessage = message;
  for (let attempt = 0; attempt <= step.maxRevisions; attempt++) {
    const reply = await runAgent(definition, currentMessage);
    const reviewed = await runAgent(
      {
        id: "manus-reviewer",
        name: "Manus 结果检查 Agent",
        systemPrompt: `根据任务、步骤要求和验收条件检查返回内容。只检查提供的文本证据，不宣称验证了未读取的文件或外部事实。只输出符合此 Schema 的 JSON：${JSON.stringify(reviewSchema)}`,
        knowledge: [],
        tools: [],
      },
      JSON.stringify({ request: message, output: reply.text }),
    );
    const review = parseReview(reviewed.text);
    record.attempts.push({
      agentId: reply.agentId,
      output: reply.text,
      reviewerId: reviewed.agentId,
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
  }
  return record;
}
