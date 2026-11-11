import { notify, text } from "@brainary/poa-sdk";
import { createAgentRunner } from "./agent.js";
import { config } from "./config.js";
import type { RunRecord } from "./contracts.js";
import { executeBundle } from "./execution.js";
import { generateBundle } from "./generator.js";
import { readTask } from "./input.js";

async function main(): Promise<void> {
  const task = await readTask();
  const runAgent = createAgentRunner(config);
  notify("正在生成任务 Agent 与执行方案……");
  const bundle = await generateBundle(task, config, runAgent);
  notify({ stage: "generated", bundle });
  const execution = await executeBundle(task, bundle, runAgent, (step) => {
    notify({ stage: "step_completed", step });
  });
  const record: RunRecord = { version: 1, task, bundle, execution };
  text(record);
}

await main();
