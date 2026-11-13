import { notify } from "@brainary/poa-sdk";
import { createAgentRunner } from "../agent.js";
import type { TaskPackage } from "../contracts.js";
import { runNode, writeFiles } from "../files.js";
import { generateBundle } from "../generator.js";
import { captureInput } from "../input.js";
import { GENERATOR_VERSION, RunJournal } from "../records.js";
import { executeAsset } from "../run.js";
import type {
  EvaluationCase,
  EvaluationRow,
  EvaluationTag,
  FrozenEvaluation,
  GeneratorStrategy,
} from "./contracts.js";
import { measureEvaluation } from "./measurement.js";

export async function evaluate(options: {
  pkg: TaskPackage;
  test: EvaluationCase;
  frozen: FrozenEvaluation;
  tag: EvaluationTag;
  strategy?: GeneratorStrategy;
}): Promise<{ row: EvaluationRow; pkg: TaskPackage }> {
  const { test, frozen, tag, strategy } = options;
  let pkg = options.pkg;
  const journal = await RunJournal.open(
    pkg.asset.method,
    pkg.asset.config,
    strategy ? "generate" : "evaluate",
    strategy ? undefined : pkg.asset,
  );
  journal.record.evaluation = tag;
  journal.record.context = frozen.context;
  journal.record.generatorVersion = GENERATOR_VERSION;
  notify(`RSI ${tag.target}/${tag.arm}：${test.id}`);
  try {
    await writeFiles(
      `${journal.paths.runDirectory}/resources`,
      frozen.resources,
    );
    await writeFiles(journal.paths.runDirectory, {
      "context.json": JSON.stringify(frozen.context, null, 2),
    });
    await journal.setRequest(test.request);
    await journal.setInput(test.input);
    await journal.trace({ type: "evaluation_started", evaluation: tag });
    if (strategy) {
      journal.record.generationStrategy = strategy;
      await journal.trace({ type: "strategy_selected", strategy });
      const generated = await generateBundle(
        test.request,
        frozen.context,
        pkg.asset.config,
        createAgentRunner(pkg.asset.config, (event) => journal.trace(event)),
        strategy,
        (status, question) => journal.observeGeneration(status, question),
      );
      if (
        generated.status !== "ready" ||
        generated.method.scenario !== "order-audit"
      )
        throw new Error("评估任务未生成可执行的订单方案。");
      const captured = await captureInput("csv", generated.material as string);
      if (captured.sha256 !== test.input.sha256)
        throw new Error("生成器未选择评估用例指定的资料。");
      pkg = {
        ...pkg,
        asset: {
          ...pkg.asset,
          assetId: journal.record.assetId,
          createdAt: new Date().toISOString(),
          method: generated.method,
          bundle: generated.bundle,
          generationStrategy: strategy,
          generatorVersion: GENERATOR_VERSION,
          executorVersion: journal.record.executorVersion,
          lineage: {
            parentAssetId: options.pkg.asset.assetId,
            sourceRunIds: [frozen.sourceRunId],
            cycleId: tag.cycleId,
          },
        },
        originalRequest: test.request,
        originalInput: test.input,
        verification: [],
      };
      await journal.completeGeneration(pkg.asset.method, pkg.asset.bundle);
    }
    pkg = { ...pkg, resources: frozen.resources };
    pkg.asset.dependencies = {
      ...pkg.asset.dependencies,
      tools: [
        ...new Set(pkg.asset.bundle.agents.flatMap((agent) => agent.tools)),
      ],
      resources: Object.keys(frozen.resources),
    };
    journal.record.conditions.tools = pkg.asset.dependencies.tools;
    await journal.saveAsset(pkg);
    await journal.save();
    await executeAsset(pkg, journal, false);
  } catch (error) {
    await journal.fail(error);
    // An unsuccessful generation has no asset; the failed run still participates in comparison.
    if (journal.record.bundle) await journal.saveAsset(pkg, true);
    await journal.updateIndex();
  }
  const evidence = JSON.parse(
    await runNode(`
import {pathToFileURL} from "node:url";
const {readEvaluation}=await import(pathToFileURL(${JSON.stringify(`${journal.paths.runDirectory}/resources/evaluation.mjs`)}));
console.log(JSON.stringify(await readEvaluation(${JSON.stringify(journal.paths.runDirectory)})));
`),
  );
  const row = measureEvaluation(evidence, journal.paths.runDirectory);
  pkg = { ...pkg, verification: [...pkg.verification, journal.verification()] };
  return { row, pkg };
}
