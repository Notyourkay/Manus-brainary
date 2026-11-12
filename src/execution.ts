import { parseReview, reviewSchema } from "./bundle.js";
import type {
  AgentDefinition,
  AgentRunner,
  ExecutionInput,
  ExecutionResult,
  ExecutionStep,
  GeneratedBundle,
  StepRecord,
  TraceSink,
} from "./contracts.js";

export async function executeBundle(
  task: ExecutionInput,
  bundle: GeneratedBundle,
  runAgent: AgentRunner,
  onStep: (record: StepRecord) => void | Promise<void>,
  trace: TraceSink = async () => {},
): Promise<ExecutionResult> {
  const definitions = new Map(bundle.agents.map((agent) => [agent.id, agent]));
  const outputs = new Map<string, string>();
  const records: StepRecord[] = [];
  for (const step of bundle.steps) {
    await trace({ type: "step_started", step });
    const definition = definitions.get(step.agentId) as AgentDefinition;
    const message = stepMessage(task, step, outputs);
    const record = await executeStep(
      step,
      definition,
      message,
      runAgent,
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
): string {
  return JSON.stringify({
    request: task.request,
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
    const reviewed = await runAgent(
      {
        id: "manus-reviewer",
        name: "Manus 结果检查 Agent",
        systemPrompt: `根据任务、步骤要求和验收条件检查返回内容。toolEvidence 是程序读取的本次任务工具回执，包含实际读写结果，可用来核对报告与业务规则；read 成功意味着任务脚本已完成 CSV 格式、金额格式、退款上限和唯一性校验。不要因为最终答案简短而忽略回执。只根据提供的文本与工具证据判断，不宣称验证未提供的外部事实。只输出符合此 Schema 的 JSON：${JSON.stringify(reviewSchema)}`,
        knowledge: [],
        tools: [],
      },
      JSON.stringify({
        request: message,
        output: reply.text,
        toolEvidence: reply.toolReceipts ?? [],
      }),
    );
    const review = parseReview(reviewed.text);
    await trace({
      type: "step_reviewed",
      stepId: step.id,
      attempt: attempt + 1,
      review,
    });
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
