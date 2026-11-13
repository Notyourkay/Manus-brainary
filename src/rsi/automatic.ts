import { notify } from "@brainary/poa-sdk";
import type { RunJournal } from "../records.js";

export type AutomaticCycle = (
  sourceDirectory: string,
  onStart: (cycle: { cycleId: string; directory: string }) => Promise<void>,
) => Promise<unknown>;

export async function runAutomaticRsi(
  journal: RunJournal,
  cycle: AutomaticCycle,
): Promise<void> {
  const decision = journal.record.rsi;
  if (decision?.status !== "pending" || !decision.eligible) return;
  decision.status = "running";
  await journal.save();
  await journal.trace({ type: "automatic_rsi_started", decision });
  notify(`任务已结束，按证据自动运行一轮 RSI：${decision.reasons.join("；")}`);
  try {
    await cycle(journal.paths.runDirectory, async (started) => {
      decision.cycleId = started.cycleId;
      decision.directory = started.directory;
      await journal.save();
    });
    decision.status = "completed";
  } catch (error) {
    decision.status = "error";
    decision.error = String(error);
    notify(
      `自动 RSI 未完成，原任务结果已保留。${decision.directory || journal.paths.runDirectory}`,
    );
  }
  await journal.trace({ type: "automatic_rsi_finished", decision });
  // 对照运行共用 PoA WM，结束时恢复来源运行及本轮 RSI 状态。
  await journal.save();
}
