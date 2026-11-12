import taskProgram from "virtual:task-program";
import resources from "virtual:task-resources";
import { notify, text } from "@brainary/poa-sdk";
import { createAgentRunner } from "./agent.js";
import { config } from "./config.js";
import { loadContext, selectContext } from "./context.js";
import type { TaskAsset, TaskContext, TaskPackage } from "./contracts.js";
import { writeFiles } from "./files.js";
import { type GenerationResult, generateBundle } from "./generator.js";
import { askForTask, captureInput, contextHint, readRequest } from "./input.js";
import { RunJournal } from "./records.js";
import { executeAsset } from "./run.js";
import { exportTaskPackages } from "./task-package.js";

async function main(): Promise<void> {
  let request = await readRequest();
  const journal = await RunJournal.open(
    contextHint(request),
    config,
    "generate",
  );
  let pkg: TaskPackage | undefined;
  try {
    await writeFiles(`${journal.paths.runDirectory}/resources`, resources);
    const runAgent = createAgentRunner(config, (event) => journal.trace(event));
    let generated: GenerationResult;
    let context: TaskContext;
    while (true) {
      await journal.setRequest(request);
      const hint = contextHint(request);
      const candidates = await loadContext({ method: hint, ...journal.paths });
      notify("Manus 正在理解任务并生成可复用 Agent……");
      generated = await generateBundle(request, candidates, config, runAgent);
      if (generated.status === "ready") {
        const method = generated.method;
        context = selectContext(
          method,
          candidates.experiences,
          candidates.episodes.filter(
            (item) => item.scenario === method.scenario,
          ),
        );
        break;
      }
      await journal.trace({
        type: "clarification_requested",
        question: generated.question,
      });
      request += `\n补充回答：${await askForTask(generated.question)}`;
    }
    const { method, bundle } = generated;
    journal.record.method = method;
    journal.record.context = context;
    await writeFiles(journal.paths.runDirectory, {
      "understanding.json": JSON.stringify(
        { method, material: generated.material },
        null,
        2,
      ),
      "context.json": JSON.stringify(context, null, 2),
    });
    await journal.trace({
      type: "task_understood",
      method,
      material: generated.material,
    });
    await journal.trace({ type: "context_selected", context });
    const input = await captureInput(
      method.inputKind,
      generated.material ?? request,
    );
    await journal.setInput(input);
    journal.record.bundle = bundle;
    journal.record.conditions.tools = [
      ...new Set(bundle.agents.flatMap((agent) => agent.tools)),
    ];
    await journal.trace({ type: "bundle_generated", bundle });
    await journal.save();
    const asset: TaskAsset = {
      version: 2,
      assetId: journal.record.assetId,
      createdAt: new Date().toISOString(),
      method,
      config,
      bundle,
      domain: context.domain,
      generatorVersion: journal.record.generatorVersion,
      executorVersion: journal.record.executorVersion,
      dependencies: {
        brainary: "0.2.0-rc",
        sdk: "0.2.0-rc",
        node: ">=22",
        modelConfiguration: config.model,
        tools: journal.record.conditions.tools,
        externalServices: [],
        resources: Object.keys(resources),
      },
    };
    pkg = {
      asset,
      originalRequest: request,
      originalInput: input,
      resources,
      experiences: context.experiences,
      verification: [],
    };
    await journal.saveAsset(pkg);
    const taskPackages = await exportTaskPackages(
      pkg,
      taskProgram,
      journal.paths.assetDirectory,
    );
    await journal.trace({
      type: "asset_exported",
      taskPackage: taskPackages.replay,
      newTaskPackage: taskPackages.newTask,
      status: "generated",
    });
    text(
      `${bundle.summary}\n角色：${bundle.agents.map((agent) => agent.name).join("、")}\n步骤：${bundle.steps.map((step) => step.id).join(" → ")}`,
    );
    text(
      `任务包：${taskPackages.replay}\n新任务入口：${taskPackages.newTask}\n状态：已生成，尚待本次执行和客观检查。`,
    );
    await executeAsset(pkg, journal);
    pkg.verification = [journal.verification()];
    await exportTaskPackages(pkg, taskProgram, journal.paths.assetDirectory);
    await journal.trace({ type: "package_evidence_updated", taskPackages });
    text(
      `任务包已附本次验证证据。\n重跑原任务：/poa fg ${taskPackages.replay}\n处理同类新任务：/poa fg ${taskPackages.newTask}\n新任务入口会显示用途，直接输入自然语言即可。`,
    );
  } catch (error) {
    await journal.fail(error);
    if (pkg) await journal.saveAsset(pkg, true);
    await journal.updateIndex();
    notify(`运行未完成，证据：${journal.paths.runDirectory}`);
    throw error;
  }
}
await main();
