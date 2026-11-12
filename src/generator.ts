import { BrainaryTool, parse_json_reply } from "@brainary/poa-sdk";
import Ajv from "ajv";
import { bundleSchema, parseBundle } from "./bundle.js";
import { toolCatalog } from "./config.js";
import type {
  AgentRunner,
  GeneratedBundle,
  ManusConfig,
  TaskContext,
  TaskMethod,
} from "./contracts.js";

export type GenerationResult =
  | { status: "clarify"; question: string }
  | {
      status: "ready";
      method: TaskMethod;
      material: string | null;
      bundle: GeneratedBundle;
    };

const generationSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["status", "question"],
      properties: {
        status: { const: "clarify" },
        question: { type: "string", minLength: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["status", "method", "material", "bundle"],
      properties: {
        status: { const: "ready" },
        method: {
          type: "object",
          additionalProperties: false,
          required: ["objective", "scenario", "inputKind"],
          properties: {
            objective: { type: "string", minLength: 1 },
            scenario: { enum: ["text", "order-audit"] },
            inputKind: { enum: ["text", "csv"] },
          },
        },
        material: { type: ["string", "null"], minLength: 1 },
        bundle: { type: "object" },
      },
    },
  ],
};
const ajv = new Ajv({ allErrors: true, logger: false });
const validateGeneration = ajv.compile<GenerationResult>(generationSchema);

export async function generateBundle(
  request: string,
  context: TaskContext,
  config: ManusConfig,
  runAgent: AgentRunner,
): Promise<GenerationResult> {
  const reply = await runAgent(
    {
      id: "manus-generator",
      name: "Manus 生成 Agent",
      tools: [],
      knowledge: [],
      systemPrompt: `你是 Manus 外层生成 Agent。理解用户完整的自然语言任务，从中提炼目标、约束和已有资料，生成可复用的任务 Agent 定义与执行方法；你不执行任务。
用户不需要按字段填写目标、材料或文件路径。资料可能直接在请求中，也可能以自然语言提供文件位置；没有外部材料的写作、解释、规划等任务直接推进，不要求用户另交材料。
只在无法完成任务且确实缺少必要信息时返回 clarify，提出一个具体问题。不要询问可自行合理决定的细节。需要核对真实订单但未提供数据或文件时，询问订单在哪里；不得从历史经历拿路径代替本次输入。
只输出 JSON，外层契约：${JSON.stringify(generationSchema)}。ready.bundle 必须符合：${JSON.stringify(bundleSchema)}。
method.objective 是可复用的任务能力描述；不写某次文件路径、数据或一次性主题。method.scenario 用于选择现有验收能力：订单结算核对为 order-audit/csv，其他为 text/text。其他任务不因为出现“CSV”字样就强制变成订单核对。
material 是你从本次请求提取的资料：订单文件只输出真实路径，不带“材料输入：”、Markdown 反引号、引号或句号；纯文字资料保留内容；不需要额外资料时为 null。它是内部运行数据，不要求用户填写这个字段。
可用工具目录：${JSON.stringify(config.availableTools.map((name) => ({ name, description: toolCatalog[name as keyof typeof toolCatalog] ?? name })))}。
角色从目录选择必要能力。自包含文本任务使用空工具数组。定义、知识和步骤不得固定本次资料、路径、数据值；任务 Agent 每次收到完整的新请求，要自行理解本次约束和资料位置，无需重生成定义。
steps 顺序执行，inputFrom 只引用前置步骤，通常 1—2 步，最后一步交付答案；maxRevisions 为 0 或 1。
所给 context 是候选资料；只采用与任务相关的内容。订单步骤的 knowledgeRefs 必须覆盖以下规则 ID：${JSON.stringify(context.domain?.rules.map((rule) => rule.id) ?? [])}。逐字复制 ID，不添加 domain.rules/ 等路径前缀；在 instruction 中说明运用。其他任务用空数组。
订单角色持有 exec_command：使用消息中的 taskTools 命令 read 读取真实数据（运行时可提供快照，或由角色从新请求提取 CSV 路径传给 read）；按领域规则计算；用 write 真正落盘。不要生成工具代码或让生成器计算结果。
订单报告字段只能是 rowCount、includedCount、cancelledCount、grossCents、refundCents、netCents、byCustomer（customer/netCents）、ruleRefs、sourceSha256，金额为整数分，sourceSha256 来自 read。最终答案展示报告内容与位置。
人工经验和经历只用于执行方法参考，不把历史数值、路径和结果当成本次输入。`,
    },
    JSON.stringify({ request, context }),
  );
  return parseGeneration(reply.text, context, config);
}

export function parseGeneration(
  raw: string,
  context: TaskContext,
  config: ManusConfig,
): GenerationResult {
  const parsed = parse_json_reply<unknown>(raw);
  if (parsed.error !== null)
    throw new Error(`生成结果不是有效 JSON：${parsed.error}`);
  if (!validateGeneration(parsed.value))
    throw new Error(
      `任务理解不符合契约：${ajv.errorsText(validateGeneration.errors)}`,
    );
  const result = parsed.value;
  if (result.status === "clarify") return result;
  const order = result.method.scenario === "order-audit";
  if (result.method.inputKind !== (order ? "csv" : "text"))
    throw new Error("任务类型与资料类型不一致。");
  if (order && !result.material)
    throw new Error("订单任务缺少资料，应先向用户澄清。");
  const knownRefs = order
    ? (context.domain?.rules.map((rule) => rule.id) ?? [])
    : [];
  result.bundle = parseBundle(
    JSON.stringify(result.bundle),
    config.availableTools,
    knownRefs,
  );
  if (order) {
    if (!context.domain) throw new Error("订单任务需要订单领域资料。");
    if (
      !result.bundle.steps.some((step) =>
        result.bundle.agents
          .find((agent) => agent.id === step.agentId)
          ?.tools.includes(BrainaryTool.exec_command),
      )
    )
      throw new Error("订单方案没有可调用真实工具的执行角色。");
    const referenced = new Set(
      result.bundle.steps.flatMap((step) => step.knowledgeRefs),
    );
    if (knownRefs.some((id) => !referenced.has(id)))
      throw new Error("生成方案未覆盖所选领域规则。");
  }
  return result;
}
