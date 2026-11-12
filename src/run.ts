import { notify, text } from "@brainary/poa-sdk";
import { createAgentRunner } from "./agent.js";
import type {
  DomainKnowledge,
  RunInput,
  TaskContext,
  TaskPackage,
  TraceEvent,
} from "./contracts.js";
import { collectEvidence } from "./evidence.js";
import { executeBundle } from "./execution.js";
import { writeFiles } from "./files.js";
import type { RunJournal } from "./records.js";
import { validateOrderRun } from "./validation.js";

export async function executeAsset(
  pkg: TaskPackage,
  journal: RunJournal,
): Promise<void> {
  const { asset } = pkg,
    { runDirectory } = journal.paths;
  let input = journal.record.input as RunInput;
  const context = journal.record.context as TaskContext;
  const inputPath = `${runDirectory}/${asset.method.inputKind === "csv" ? "input.csv" : "input.txt"}`;
  const trace = async (event: TraceEvent) => {
    await journal.trace(event);
    if (event.type === "step_started")
      notify(`开始步骤：${JSON.stringify(event.step)}`);
    if (event.type === "step_revision")
      notify(`修订步骤 ${event.stepId}：${event.feedback}`);
  };
  const execution = await executeBundle(
    {
      request: journal.record.request,
      method: asset.method,
      material: {
        kind: asset.method.inputKind,
        value:
          asset.method.inputKind === "csv" && input.source !== "user:text"
            ? inputPath
            : input.content,
      },
      context,
    },
    asset.bundle,
    createAgentRunner(asset.config, trace, {
      scenario: asset.method.scenario,
      runId: journal.record.runId,
      assetId: asset.assetId,
      runDirectory,
      inputPath,
      inputIsSnapshot: input.source !== "user:text",
      sourceRoot: journal.record.conditions.cwd,
      toolScript: `${runDirectory}/resources/order-tools.mjs`,
    }),
    async (step) => {
      notify(
        `步骤 ${step.stepId}：${step.status === "passed" ? "模型检查通过" : "模型检查未通过"}`,
      );
      await trace({ type: "step_completed", step });
      journal.record.execution ??= {
        status: "failed",
        steps: [],
        finalOutput: null,
      };
      journal.record.execution.steps.push(step);
      await journal.save();
    },
    trace,
  );
  journal.record.execution = execution;
  const evidence = await collectEvidence(runDirectory);
  if (asset.method.scenario === "order-audit" && evidence.input) {
    input = evidence.input;
    await journal.setInput(input);
  }
  journal.record.acceptance =
    asset.method.scenario === "order-audit"
      ? input.source === "user:text"
        ? {
            kind: "objective",
            passed: false,
            checks: [
              {
                id: "tool.read",
                passed: false,
                expected: "读取本次真实订单资料",
                actual: "没有成功读取订单文件",
              },
            ],
          }
        : validateOrderRun({
            input,
            domain: context.domain as DomainKnowledge,
            report: evidence.report,
            reportHash: evidence.reportHash,
            receipts: evidence.receipts,
            bundle: asset.bundle,
            agentIds: execution.steps.flatMap((step) =>
              step.attempts.map((attempt) => attempt.agentId),
            ),
          })
      : {
          kind: "model-only",
          passed: execution.status === "completed",
          checks: [
            {
              id: "model-review",
              passed: execution.status === "completed",
              expected: "步骤检查通过",
              actual: execution.status,
            },
          ],
        };
  journal.record.status =
    execution.status === "completed" && journal.record.acceptance.passed
      ? "completed"
      : "failed";
  journal.record.finishedAt = new Date().toISOString();
  await trace({
    type: "acceptance_completed",
    acceptance: journal.record.acceptance,
    toolCalls: evidence.receipts.length,
  });
  await writeFiles(runDirectory, {
    "acceptance.json": JSON.stringify(
      {
        input,
        conditions: journal.record.conditions,
        ...journal.record.acceptance,
      },
      null,
      2,
    ),
    "result.md": `${journal.record.status === "completed" ? "" : "本次验收未通过。\n\n"}${execution.finalOutput ?? "检查未通过，请查看运行记录。"}`,
  });
  await journal.trace({ type: "run_finished", status: journal.record.status });
  await journal.save();
  await journal.saveAsset(pkg, true);
  await journal.updateIndex();
  text(execution.finalOutput ?? "任务检查未通过。");
  if (evidence.report !== null) text(evidence.report);
  text({
    status: journal.record.status,
    acceptance: journal.record.acceptance.kind,
    modelReviewPassed: execution.status === "completed",
    checksPassed: journal.record.acceptance.passed,
    assetId: asset.assetId,
    runId: journal.record.runId,
    records: runDirectory,
    humanAcceptance: "pending",
  });
}
