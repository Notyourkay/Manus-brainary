import { bundleSchema, parseBundle } from "./bundle.js";
import type {
  AgentRunner,
  GeneratedBundle,
  ManusConfig,
  TaskRequest,
} from "./contracts.js";

export async function generateBundle(
  task: TaskRequest,
  config: ManusConfig,
  runAgent: AgentRunner,
): Promise<GeneratedBundle> {
  const reply = await runAgent(
    {
      id: "manus-generator",
      name: "Manus 生成 Agent",
      systemPrompt: generatorPrompt(config),
      knowledge: [],
      tools: [],
    },
    task.description,
  );
  return parseBundle(reply.text, config.availableTools);
}

function generatorPrompt(config: ManusConfig): string {
  return `你是 Manus 的生成 Agent。根据用户任务生成 Agent 定义和执行方案。
你负责设计执行方法，实际任务交给生成的 Agent 执行。只输出符合以下 Schema 的 JSON：
${JSON.stringify(bundleSchema)}

约定：
- agents 描述角色、系统提示词、任务上下文和所需工具。knowledge 仅整理用户提供的上下文，不编造来源。
- 可选工具只有 ${JSON.stringify(config.availableTools)}；不需要工具时使用空数组。
- steps 按实际执行顺序排列，每个 agentId 引用一个 agents.id。
- inputFrom 引用已排列在前面的步骤 ID，执行器会把这些步骤的结果传入当前步骤。
- 当前执行器顺序执行；不表达并行、分支或循环。按任务需要选择角色和步骤，不固定为某个业务流程。
- acceptanceCriteria 写可依据返回内容检查的具体要求。maxRevisions 为 0 或 1，表示检查失败后是否修订一次。
- 最后一个步骤产出用户所需的最终答案；需要汇总时显式生成汇总步骤及其输入依赖。
- 根据任务复杂度选择必要的 Agent 和步骤，简单任务允许只有一个 Agent、一个步骤。`;
}
