import { notify, text } from "@brainary/poa-sdk";
import { createAgentRunner } from "./agent.js";
import type { TaskAsset, TraceEvent } from "./contracts.js";
import { executeBundle } from "./execution.js";
import { writeFiles } from "./files.js";
import type { RunJournal } from "./records.js";

export async function executeAsset(
  asset: TaskAsset,
  journal: RunJournal,
): Promise<void> {
  const trace = async (event: TraceEvent) => {
    await journal.trace(event);
    if (event.type === "step_started")
      notify(`开始步骤：${JSON.stringify(event.step)}`);
    if (event.type === "step_revision")
      notify(`修订步骤 ${event.stepId}：${event.feedback}`);
  };
  const execution = await executeBundle(
    asset.task,
    asset.bundle,
    createAgentRunner(asset.config, trace),
    async (step) => {
      notify(
        `步骤 ${step.stepId}：${step.status === "passed" ? "检查通过" : "检查未通过"}`,
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
  journal.record.status = execution.status;
  journal.record.finishedAt = new Date().toISOString();
  await journal.trace({ type: "run_finished", status: execution.status });
  await journal.save();
  await writeFiles(journal.paths.runDirectory, {
    "result.md":
      execution.finalOutput ??
      "任务检查未通过，请查看 record.json 和 trace.jsonl。",
  });
  text(execution.finalOutput ?? "任务检查未通过。");
  text({
    status: execution.status,
    assetId: asset.assetId,
    runId: journal.record.runId,
    records: journal.paths.runDirectory,
  });
}
