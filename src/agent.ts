import {
  type Agent,
  AgentExecutor,
  type AgentResult,
  AgentResultTimeoutError,
} from "@brainary/poa-sdk";
import type { AgentRunner, ManusConfig } from "./contracts.js";

export function createAgentRunner(config: ManusConfig): AgentRunner {
  const executor = new AgentExecutor();
  return async (definition, message) => {
    const agent = await executor.create_agent({
      name: definition.name,
      agent_config: {
        model: config.model,
        system_prompt: [
          definition.systemPrompt,
          ...definition.knowledge.map((item) => `任务上下文：${item}`),
        ].join("\n\n"),
        capabilities: { brainary_tool: definition.tools },
      },
    });
    try {
      const result = await runToCompletion(
        agent,
        executor,
        message,
        config.agentTimeoutMs,
      );
      if (result.agent_status !== "completed" || !result.result?.trim()) {
        throw new Error(
          `${definition.name} 执行未完成：${result.error ?? result.agent_status}`,
        );
      }
      return { agentId: agent.agent_id, text: result.result };
    } finally {
      await agent.close();
    }
  };
}

async function runToCompletion(
  agent: Agent,
  executor: AgentExecutor,
  message: string,
  timeoutMs: number,
): Promise<AgentResult> {
  const deadline = Date.now() + timeoutMs;
  try {
    return await agent.run(
      message,
      undefined,
      null,
      Math.min(30_000, timeoutMs),
    );
  } catch (error) {
    if (!(error instanceof AgentResultTimeoutError)) throw error;
  }
  // SDK 等待超时不会终止 Agent，继续获取同一次执行的结果，不重发任务。
  while (Date.now() < deadline) {
    try {
      return await executor.acquire_agent_result(
        agent.agent_id,
        Math.min(30_000, deadline - Date.now()),
      );
    } catch (error) {
      if (!(error instanceof AgentResultTimeoutError)) throw error;
    }
  }
  throw new Error(
    `Agent ${agent.agent_id} 超过 ${timeoutMs / 1000} 秒执行时限。`,
  );
}
