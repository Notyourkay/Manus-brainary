import { parse_json_reply } from "@brainary/poa-sdk";
import Ajv from "ajv";
import type { AgentRunner } from "./contracts.js";
import { collectEvidence } from "./evidence.js";
import { runNode, writeFiles } from "./files.js";
import type {
  Checkpoint,
  CognitiveCheck,
  CognitiveReview,
} from "./monitoring.js";
import type { RunJournal } from "./records.js";
import type { WorkingMemory } from "./working-memory.js";

const refs = {
  type: "array",
  minItems: 1,
  uniqueItems: true,
  items: { type: "string", minLength: 1 },
};
export const cognitiveSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "feedback", "coverage", "progress", "problems"],
  properties: {
    passed: { type: "boolean" },
    feedback: { type: "string", minLength: 1 },
    progress: { type: "string", minLength: 1 },
    coverage: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["goal", "status", "evidenceRefs"],
        properties: {
          goal: { type: "string", minLength: 1 },
          status: { enum: ["planned", "satisfied", "missing"] },
          evidenceRefs: refs,
        },
      },
    },
    problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "detail", "evidenceRefs"],
        properties: {
          kind: { enum: ["gap", "failure", "redundancy"] },
          detail: { type: "string", minLength: 1 },
          evidenceRefs: refs,
        },
      },
    },
  },
};
const ajv = new Ajv({ allErrors: true, logger: false });
const validate = ajv.compile<CognitiveReview>(cognitiveSchema);

export function parseCognitiveReview(
  raw: string,
  evidenceRefs: readonly string[],
): CognitiveReview {
  const parsed = parse_json_reply<unknown>(raw);
  if (parsed.error !== null)
    throw new Error(`元认知输出不是 JSON：${parsed.error}`);
  if (!validate(parsed.value))
    throw new Error(`元认知输出不符合契约：${ajv.errorsText(validate.errors)}`);
  for (const finding of [...parsed.value.coverage, ...parsed.value.problems]) {
    for (const ref of finding.evidenceRefs)
      if (!evidenceRefs.includes(ref))
        throw new Error(`元认知引用了未读取的证据：${ref}`);
  }
  return parsed.value;
}

export async function checkState(
  journal: RunJournal,
  runAgent: AgentRunner,
  checkpoint: Checkpoint,
  stepId = "",
  attempt = 0,
  output?: string,
): Promise<CognitiveCheck> {
  const m = journal.record.monitoring;
  const id = `check-${m.checks.length + 1}`;
  const directory = `${journal.paths.runDirectory}/checks`;
  m.checkpoint = checkpoint;
  m.activeStep = stepId;
  m.attempt = attempt;
  if (output !== undefined) {
    m.outputRef = `${directory}/${id}-output.txt`;
    await writeFiles(directory, { [`${id}-output.txt`]: output });
  }
  const evidence = await collectEvidence(journal.paths.runDirectory);
  m.toolCalls = evidence.receipts.length;
  m.toolErrors = evidence.receipts.filter((r) => r.status === "error").length;
  m.reportRef = evidence.reportHash
    ? `${journal.paths.runDirectory}/report.json`
    : "";
  await journal.save();
  const wm = await journal.readWorkingMemory();
  const documents = await readCheckEvidence(wm);
  const wmRef = `${directory}/${id}-wm.json`;
  const evidenceRef = `${directory}/${id}-evidence.json`;
  const resultRef = `${directory}/${id}.json`;
  await writeFiles(directory, {
    [`${id}-wm.json`]: JSON.stringify(wm, null, 2),
    [`${id}-evidence.json`]: JSON.stringify(documents, null, 2),
  });
  await journal.trace({
    type: "metacognition_started",
    checkpoint,
    stepId,
    attempt,
    wmRef,
    evidenceRef,
  });
  const reply = await runAgent(
    {
      id: "manus-reviewer",
      name: "Manus 元认知检查 Agent",
      tools: [],
      knowledge: [],
      systemPrompt: `根据 SDK 读回的 workingMemory 及按引用读取的 documents 判断目标覆盖、当前进展和问题。只输出数据 JSON，符合：${JSON.stringify(cognitiveSchema)}。
evidenceRefs 只能使用 documents 的短键（例如 bundle、output、tools），不要抄写 ref 中的路径；每份文档的 ref 是真实位置，content 是读回内容。coverage 要列出本次任务目标及 planned/satisfied/missing 状态。问题必须引用实际依据；无问题用空数组。
plan_completed：检查方案是否覆盖目标、领域约束和工具能力，尚未执行的结果应标 planned。缺失则 passed=false 并提供任务角色可直接执行的纠偏指令。可执行但重复重述规则的步骤可记录 redundancy，不因此阻止执行；只在确实能合并且不损害目标时指出。
step_completed：按 activeStep 的 acceptanceCriteria 检查当前输出与工具回执。中间步骤不承担后续步骤目标；后续目标尚 planned 不构成当前失败。失败时具体说明怎么纠正。成功 read 已做格式/金额/唯一性校验，write 回执是实际落盘证据，不能仅凭简短回答判失败。冗余判断要指出具体步骤及与其他步骤的重叠。
task_completed：结合全部步骤、最终结果与独立 acceptance 判断完整目标，客观检查失败不能判通过。普通文字任务逐项核对原请求。仅根据提供的事实与证据判断，不虚构执行。`,
    },
    JSON.stringify({ workingMemory: wm, documents }),
  );
  const review = parseCognitiveReview(reply.text, Object.keys(documents));
  for (const finding of [...review.coverage, ...review.problems]) {
    finding.evidenceRefs = finding.evidenceRefs.map(
      (key) => documents[key].ref,
    );
  }
  if (
    checkpoint === "task_completed" &&
    journal.record.acceptance?.passed === false
  ) {
    review.passed = false;
    review.problems.push({
      kind: "failure",
      detail: `客观/步骤检查失败：${wm.metacognition.failedCriteria}`,
      evidenceRefs: [wm.evidence.acceptance],
    });
  }
  const check: CognitiveCheck = {
    id,
    checkpoint,
    stepId,
    attempt,
    reviewerId: reply.agentId,
    wmRef,
    evidenceRef,
    resultRef,
    review,
  };
  m.checks.push(check);
  await writeFiles(directory, {
    [`${id}.json`]: JSON.stringify(check, null, 2),
  });
  await journal.trace({ type: "metacognition_completed", check });
  if (!review.passed) {
    m.checkpoint = "check_failed";
    await journal.trace({
      type: "check_failed",
      checkpoint,
      checkId: id,
      resultRef,
      feedback: review.feedback,
    });
  }
  await journal.save();
  if (!review.passed)
    await writeFiles(directory, {
      [`${id}-failed-wm.json`]: JSON.stringify(
        await journal.readWorkingMemory(),
        null,
        2,
      ),
    });
  return check;
}

async function readCheckEvidence(
  wm: WorkingMemory,
): Promise<Record<string, { ref: string; content: unknown }>> {
  const references = {
    request: wm.evidence.request,
    input: wm.evidence.input,
    bundle: wm.generation.bundleRef,
    context: wm.generation.contextRef,
    execution: wm.execution.stepsRef,
    output: wm.execution.outputRef,
    tools: wm.evidence.tools,
    report: wm.evidence.report,
    acceptance: wm.evidence.acceptance,
  };
  return JSON.parse(
    await runNode(`
import {readFile} from "node:fs/promises";
const documents={};
for(const [key,ref] of Object.entries(${JSON.stringify(references)})) {
 if(!ref) continue;
 const text=await readFile(ref,"utf8");
 const content=ref.endsWith(".jsonl") ? text.trim().split("\\n").filter(Boolean).map(JSON.parse) : ref.endsWith(".json") ? JSON.parse(text) : text;
 documents[key]={ref,content};
}
console.log(JSON.stringify(documents));
`),
  );
}
