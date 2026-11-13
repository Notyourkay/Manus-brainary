import { parse_json_reply } from "@brainary/poa-sdk";
import Ajv from "ajv";
import { bundleSchema } from "../bundle.js";
import type { AgentDefinition, AgentRunner } from "../contracts.js";
import { parseGeneration } from "../generator.js";
import type { GeneratorStrategy, Reflection, RsiSource } from "./contracts.js";

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "diagnosis",
    "sourceRunIds",
    "experiences",
    "innerBundle",
    "strategyInstructions",
  ],
  properties: {
    diagnosis: { type: "string", minLength: 1 },
    sourceRunIds: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string" },
    },
    experiences: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["content", "applicability"],
        properties: {
          content: { type: "string", minLength: 1 },
          applicability: { type: "string", minLength: 1 },
        },
      },
    },
    innerBundle: { type: "object" },
    strategyInstructions: { type: "string", minLength: 1 },
  },
};
const ajv = new Ajv({ allErrors: true, logger: false });
const validate = ajv.compile<Reflection>(schema);

export async function reflect(
  source: RsiSource,
  strategy: GeneratorStrategy,
  runAgent: AgentRunner,
  saveRaw: (raw: string, attempt: number) => Promise<void>,
): Promise<Reflection> {
  const definition: AgentDefinition = {
    id: "manus-reflector",
    name: "Manus RSI 复盘 Agent",
    tools: [],
    knowledge: [],
    systemPrompt: `根据真实运行记录复盘，提出两个独立改进：innerBundle 改进任务 Agent 定义及步骤；strategyInstructions 改进以后生成同类任务的生成策略。只输出 JSON：${JSON.stringify(schema)}。输出是数据对象，顶层只能有 diagnosis、sourceRunIds、experiences、innerBundle、strategyInstructions 五个字段；不要把 type、properties、required 等 Schema 字段抄入数据。innerBundle 契约：${JSON.stringify(bundleSchema)}。
只引用提供的 sourceRunId。经验写成适用条件和可执行的方法，不虚构运行、收益或普适结论。经验候选之后由真实对照验证。
优先修复失败，再减少不必要的 Agent 步骤。若单独的规则整理可以融入任务角色，合并成一次工具执行步骤即可；固定的结果检查仍由执行器执行，不能删除或修改。
保留全部领域规则 ID、整数分计算、read/write 工具和报告契约；角色从 source.config.availableTools 中选工具。只有任务角色负责工具执行，不把计算预写到答案。定义与策略不能固化本次路径、数值、客户或文件名。
新的外层策略是对标准生成提示词的补充，清楚说明如何生成方案，例如适用时用一个具备 exec_command 的执行角色，避免只有规则重述的空步骤。不要改变 SDK、检查器、输入或领域规则。`,
  };
  const message = JSON.stringify({
    sourceRunId: source.record.runId,
    request: source.record.request,
    method: source.record.method,
    input: source.record.input,
    config: source.pkg.asset.config,
    context: source.record.context,
    bundle: source.pkg.asset.bundle,
    execution: source.record.execution,
    acceptance: source.record.acceptance,
    error: source.record.error,
    toolReceipts: source.toolReceipts,
    agentCalls: source.agentCalls,
    strategy,
  });
  const reply = await runAgent(definition, message);
  await saveRaw(reply.text, 1);
  try {
    return parseReflection(reply.text, source);
  } catch (error) {
    const correction = await runAgent(
      definition,
      JSON.stringify({
        source: JSON.parse(message),
        previousReply: reply.text,
        correction: `校验错误：${String(error)}。请修正并重新输出完整数据对象。`,
      }),
    );
    await saveRaw(correction.text, 2);
    return parseReflection(correction.text, source);
  }
}

export function parseReflection(raw: string, source: RsiSource): Reflection {
  const parsed = parse_json_reply<unknown>(raw);
  if (parsed.error !== null)
    throw new Error(`复盘不是有效 JSON：${parsed.error}`);
  if (!validate(parsed.value))
    throw new Error(`复盘不符合契约：${ajv.errorsText(validate.errors)}`);
  const result = parsed.value;
  if (
    result.sourceRunIds.length !== 1 ||
    result.sourceRunIds[0] !== source.record.runId
  )
    throw new Error("复盘引用了未提供的来源运行。");
  const generated = parseGeneration(
    JSON.stringify({
      status: "ready",
      method: source.pkg.asset.method,
      material: source.pkg.originalInput.source,
      bundle: result.innerBundle,
    }),
    source.record.context as NonNullable<RsiSource["record"]["context"]>,
    source.pkg.asset.config,
  );
  if (generated.status === "ready") result.innerBundle = generated.bundle;
  return result;
}
