import taskProgram from "virtual:task-program";
import { notify, text } from "@brainary/poa-sdk";
import { createAgentRunner } from "./agent.js";
import { config } from "./config.js";
import type { TaskAsset } from "./contracts.js";
import { writeFiles } from "./files.js";
import { generateBundle } from "./generator.js";
import { readTask } from "./input.js";
import { RunJournal } from "./records.js";
import { executeAsset } from "./run.js";
import { exportTaskPackage } from "./task-package.js";

async function main(): Promise<void> {
  const task = await readTask();
  const journal = await RunJournal.open(task, config);
  try {
    notify(
      `正在生成任务 Agent 与执行方案。运行记录：${journal.paths.runDirectory}`,
    );
    const bundle = await generateBundle(
      task,
      config,
      createAgentRunner(config, (event) => journal.trace(event)),
    );
    journal.record.bundle = bundle;
    await journal.trace({ type: "bundle_generated", bundle });
    await journal.save();
    const asset: TaskAsset = {
      version: 1,
      assetId: journal.record.assetId,
      createdAt: new Date().toISOString(),
      task,
      config,
      bundle,
      generatorVersion: journal.record.generatorVersion,
      executorVersion: journal.record.executorVersion,
    };
    await writeFiles(journal.paths.assetDirectory, {
      "asset.json": JSON.stringify(asset, null, 2),
    });
    const taskPackage = await exportTaskPackage(
      asset,
      taskProgram,
      journal.paths.assetDirectory,
    );
    await journal.trace({ type: "asset_exported", taskPackage });
    notify(
      `${bundle.summary}\n角色：${bundle.agents.map((agent) => agent.name).join("、")}\n步骤：${bundle.steps.map((step) => `${step.id} → ${step.agentId}`).join("；")}`,
    );
    notify(`任务包已生成：${taskPackage}\n复用命令：/poa fg ${taskPackage}`);
    text(
      `${bundle.summary}\n角色：${bundle.agents.map((agent) => agent.name).join("、")}\n步骤：${bundle.steps.map((step) => step.id).join(" → ")}`,
    );
    text(`任务包：${taskPackage}\n运行记录：${journal.paths.runDirectory}`);
    await executeAsset(asset, journal);
  } catch (error) {
    await journal.fail(error);
    notify(`本次运行未完成，错误与轨迹保存在 ${journal.paths.runDirectory}`);
    throw error;
  }
}

await main();
