import {
  type Agent,
  AgentExecutor,
  type AgentResult,
  AgentResultTimeoutError,
  BrainaryTool,
} from "@brainary/poa-sdk";
import type {
  AgentRunContext,
  AgentRunner,
  ManusConfig,
  TraceSink,
} from "./contracts.js";
import { collectEvidence } from "./evidence.js";
import { writeFiles } from "./files.js";

export function createAgentRunner(
  config: ManusConfig,
  trace: TraceSink = async () => {},
  runtime?: AgentRunContext,
): AgentRunner {
  const executor = new AgentExecutor();
  return async (definition, message) => {
    await trace({ type: "agent_requested", definition, message });
    const agent = await executor.create_agent({
      name: definition.name,
      agent_config: {
        model: config.model,
        ...(runtime ? { runtime: { workspace: runtime.runDirectory } } : {}),
        system_prompt: [
          definition.systemPrompt,
          ...definition.knowledge.map((item) => `任务上下文：${item}`),
        ].join("\n\n"),
        capabilities: { brainary_tool: definition.tools },
      },
    });
    try {
      await trace({
        type: "agent_created",
        definitionId: definition.id,
        agentId: agent.agent_id,
      });
      if (
        runtime?.scenario === "order-audit" &&
        definition.tools.includes(BrainaryTool.exec_command)
      ) {
        const contextPath = `${runtime.runDirectory}/calls/${agent.agent_id}.json`;
        await writeFiles(`${runtime.runDirectory}/calls`, {
          [`${agent.agent_id}.json`]: JSON.stringify({
            ...runtime,
            agentId: agent.agent_id,
            reportPath: `${runtime.runDirectory}/report.json`,
            receiptsPath: `${runtime.runDirectory}/tool-calls.jsonl`,
          }),
        });
        const command = `node ${shellQuote(runtime.toolScript)}`;
        message = JSON.stringify({
          request: JSON.parse(message),
          taskTools: {
            inputBaseDirectory: runtime.sourceRoot,
            read: `${command} read ${shellQuote(contextPath)}${runtime.inputIsSnapshot ? "" : " '<从本次请求提取的 CSV 文件路径>'"}`,
            write: `${command} write ${shellQuote(contextPath)} '<完整报告 JSON>'`,
            instructions: `${runtime.inputIsSnapshot ? "本次已提供资料快照，直接执行 read 命令读取，不要再读取原地址。" : "从本次自然语言请求提取实际 CSV 文件位置，替换 read 的路径占位符；不要把整段请求或展示标点当作路径。用户说的当前目录是 inputBaseDirectory。相对路径原样传给 read，由工具按该目录解析。"} 必须通过 exec_command 执行 read 获取数据，再计算报告并执行 write。write 最后一个参数是完整 JSON，正确进行 shell 引号转义。不用虚构数据替代工具，不另写脚本绕过业务读写。`,
          },
        });
      }
      await trace({ type: "agent_input", agentId: agent.agent_id, message });
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
      await trace({
        type: "agent_completed",
        definitionId: definition.id,
        agentId: agent.agent_id,
        output: result.result,
      });
      const toolReceipts =
        runtime && definition.tools.includes(BrainaryTool.exec_command)
          ? (await collectEvidence(runtime.runDirectory)).receipts.filter(
              (item) => item.agentId === agent.agent_id,
            )
          : [];
      return { agentId: agent.agent_id, text: result.result, toolReceipts };
    } catch (error) {
      await trace({
        type: "agent_error",
        definitionId: definition.id,
        agentId: agent.agent_id,
        error: String(error),
      });
      throw error;
    } finally {
      await agent.close();
      await trace({
        type: "agent_closed",
        definitionId: definition.id,
        agentId: agent.agent_id,
      });
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
