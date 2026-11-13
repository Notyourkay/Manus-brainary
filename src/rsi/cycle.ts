import suite from "virtual:rsi-cases";
import taskProgram from "virtual:task-program";
import resources from "virtual:task-resources";
import { notify, text } from "@brainary/poa-sdk";
import { createAgentRunner } from "../agent.js";
import type {
  Experience,
  TaskContext,
  TaskPackage,
  TraceEvent,
} from "../contracts.js";
import { runNode, writeFiles } from "../files.js";
import { EXECUTOR_VERSION } from "../records.js";
import { exportTaskPackage } from "../task-package.js";
import { compareEvaluations } from "./comparison.js";
import {
  type CycleResult,
  defaultStrategy,
  type EvaluationCase,
  type EvaluationRow,
  type GeneratorStrategy,
} from "./contracts.js";
import { evaluate } from "./evaluation.js";
import { reflect } from "./proposal.js";
import {
  freshId,
  loadLearning,
  openCycle,
  publishLearning,
  readSource,
} from "./store.js";

export async function runCycle(sourceDirectory: string): Promise<void> {
  const source = await readSource(sourceDirectory);
  const cycle = await openCycle(source.pkg.asset.config.artifactRoot);
  const { cycleId, directory } = cycle;
  let stage = "prepare";
  const save = async (name: string, value: unknown) =>
    writeFiles(directory, { [name]: JSON.stringify(value, null, 2) });
  const trace = async (event: TraceEvent) => {
    await runNode(
      `import {appendFile} from "node:fs/promises"; await appendFile(${JSON.stringify(`${directory}/trace.jsonl`)},${JSON.stringify(`${JSON.stringify({ ...event, cycleId, time: new Date().toISOString() })}\n`)});`,
    );
  };
  try {
    await writeFiles(`${directory}/resources`, resources);
    await save("source.json", source);
    const context = source.record.context as TaskContext;
    await save("context.json", context);
    const learning = await loadLearning(cycle.memoryRoot, directory);
    const baselineStrategy =
      learning.strategies["order-audit"] ??
      source.pkg.asset.generationStrategy ??
      defaultStrategy("order-audit");
    await save("baseline-strategy.json", baselineStrategy);
    const cases: EvaluationCase[] = JSON.parse(
      await runNode(`
import {mkdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
const directory=${JSON.stringify(`${directory}/cases`)};
await mkdir(directory,{recursive:true});
const cases=[{id:"source",request:${JSON.stringify(source.pkg.originalRequest)},input:${JSON.stringify(source.pkg.originalInput)}}];
for(const [id,content] of Object.entries(${JSON.stringify(suite.materials)})){
 const path=join(directory,id+".csv"); await writeFile(path,content);
 cases.push({id,request:${JSON.stringify(suite.request)}.replace("{path}",path),input:{source:path,content,sha256:createHash("sha256").update(content).digest("hex")}});
}
console.log(JSON.stringify(cases));
`),
    );
    await save("cases.json", {
      version: suite.version,
      inner: suite.inner,
      outer: suite.outer,
      heldOutFromReflection: suite.heldOutFromReflection,
      cases,
    });
    await trace({ type: "cycle_started", sourceRunId: source.record.runId });
    stage = "reflection";
    notify(`RSI 正在复盘运行 ${source.record.runId}；实验目录：${directory}`);
    const reflection = await reflect(
      source,
      baselineStrategy,
      createAgentRunner(source.pkg.asset.config, trace),
      (raw, attempt) =>
        writeFiles(directory, {
          [attempt === 1 ? "reflection-raw.txt" : "reflection-repair-raw.txt"]:
            raw,
        }),
    );
    await save("reflection.json", reflection);
    const createdAt = new Date().toISOString();
    const candidateStrategy: GeneratorStrategy = {
      id: await freshId(),
      parentId: baselineStrategy.id,
      scenario: "order-audit",
      instructions: reflection.strategyInstructions,
      sourceRunIds: [source.record.runId],
      createdAt,
    };
    const lineage = {
      parentAssetId: source.pkg.asset.assetId,
      sourceRunIds: [source.record.runId],
      cycleId,
    };
    const baseline: TaskPackage = {
      ...source.pkg,
      asset: {
        ...source.pkg.asset,
        executorVersion: EXECUTOR_VERSION,
        assetId: await freshId(),
        lineage,
        createdAt,
      },
      resources,
      verification: [],
    };
    const candidate: TaskPackage = {
      ...baseline,
      asset: {
        ...baseline.asset,
        assetId: await freshId(),
        bundle: reflection.innerBundle,
      },
    };
    await save("inner-candidate.json", candidate.asset);
    await save("outer-candidate.json", candidateStrategy);
    await save(
      "experience-candidates.json",
      reflection.experiences.map((item, i) => ({
        ...item,
        id: `${cycleId}-experience-${i + 1}`,
        status: "candidate",
        sourceRunIds: [source.record.runId],
      })),
    );
    const frozen = {
      cycleId,
      sourceRunId: source.record.runId,
      context,
      resources,
    };
    const innerRows: { baseline: EvaluationRow[]; candidate: EvaluationRow[] } =
      { baseline: [], candidate: [] };
    const innerPackages = { baseline, candidate };
    stage = "inner";
    for (const caseId of suite.inner) {
      for (const arm of ["baseline", "candidate"] as const) {
        const evaluated = await evaluate({
          pkg: innerPackages[arm],
          test: cases.find((item) => item.id === caseId) as EvaluationCase,
          frozen,
          tag: { cycleId, target: "inner", arm, caseId },
        });
        innerRows[arm].push(evaluated.row);
        innerPackages[arm] = evaluated.pkg;
        await save("inner-progress.json", innerRows);
      }
    }
    const inner = compareEvaluations(innerRows.baseline, innerRows.candidate);
    await save("inner-comparison.json", inner);
    stage = "outer";
    const outerRows: typeof innerRows = { baseline: [], candidate: [] };
    for (const caseId of suite.outer) {
      for (const arm of ["baseline", "candidate"] as const) {
        const evaluated = await evaluate({
          pkg: baseline,
          test: cases.find((item) => item.id === caseId) as EvaluationCase,
          frozen,
          tag: { cycleId, target: "outer", arm, caseId },
          strategy: arm === "baseline" ? baselineStrategy : candidateStrategy,
        });
        outerRows[arm].push(evaluated.row);
        await save("outer-progress.json", outerRows);
      }
    }
    const outer = compareEvaluations(outerRows.baseline, outerRows.candidate);
    await save("outer-comparison.json", outer);
    stage = "export";
    // Baseline evaluation uses a distinct asset ID, leaving the source directory byte-for-byte intact.
    const selected = innerPackages[inner.adopted ? "candidate" : "baseline"];
    await writeFiles(`${directory}/selected`, {
      "asset.json": JSON.stringify(selected.asset, null, 2),
    });
    const selectedPackage = await exportTaskPackage(
      selected,
      taskProgram,
      `${directory}/selected`,
    );
    const supportedRows = [
      ...(inner.adopted ? inner.candidate : []),
      ...(outer.adopted ? outer.candidate : []),
    ];
    const experiences: Experience[] = supportedRows.length
      ? reflection.experiences.map((item, i) => ({
          id: `${cycleId}-experience-${i + 1}`,
          version: "1",
          scenario: "order-audit",
          ...item,
          source: `${directory}/reflection.json`,
          provenance: {
            status: "validated",
            cycleId,
            sourceRunIds: [source.record.runId],
            evaluationRunIds: supportedRows.map((row) => row.runId),
            caseIds: [...new Set(supportedRows.map((row) => row.caseId))],
            scope:
              "本次订单用例上，包含这些方法的候选整体通过并有收益；未证明单条经验的独立因果作用或跨领域有效性。",
          },
        }))
      : [];
    const result: CycleResult = {
      version: 1,
      cycleId,
      sourceRunId: source.record.runId,
      status: "completed",
      inner,
      outer,
      selectedAssetId: selected.asset.assetId,
      selectedStrategyId: (outer.adopted ? candidateStrategy : baselineStrategy)
        .id,
      selectedPackage,
      publishedExperienceIds: experiences.map((item) => item.id),
      humanAcceptance: "pending",
    };
    await save("result.json", { ...result, publication: "pending" });
    stage = "publish";
    if (outer.adopted || experiences.length)
      await publishLearning(cycle.memoryRoot, directory, {
        strategies: outer.adopted ? { "order-audit": candidateStrategy } : {},
        experiences,
      });
    await save("result.json", {
      ...result,
      publication: "completed",
      memoryRoot: cycle.memoryRoot,
    });
    await trace({
      type: "cycle_finished",
      innerAdopted: inner.adopted,
      outerAdopted: outer.adopted,
      selectedPackage,
    });
    text(
      `RSI 完成，等待人工验收。\n内层：${inner.reason}\n通过：${inner.totals.baselinePassed}/${suite.inner.length} → ${inner.totals.candidatePassed}/${suite.inner.length}；Agent 调用：${inner.totals.baselineCalls} → ${inner.totals.candidateCalls}\n外层：${outer.reason}\n通过：${outer.totals.baselinePassed}/${suite.outer.length} → ${outer.totals.candidatePassed}/${suite.outer.length}；Agent 调用：${outer.totals.baselineCalls} → ${outer.totals.candidateCalls}\n选中任务包：${selectedPackage}\n证据：${directory}\n本轮发布经验：${experiences.length} 条。`,
    );
  } catch (error) {
    await save("error.json", {
      cycleId,
      stage,
      error: String(error),
      time: new Date().toISOString(),
    });
    await trace({ type: "cycle_error", stage, error: String(error) });
    notify(`RSI 在 ${stage} 阶段停止。证据：${directory}`);
    throw error;
  }
}
