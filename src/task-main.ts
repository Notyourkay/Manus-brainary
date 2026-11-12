import { notify, text } from "@brainary/poa-sdk";
import { loadContext } from "./context.js";
import type { TaskEntryMode, TaskPackage } from "./contracts.js";
import { writeFiles } from "./files.js";
import { captureInput, readPackageInput } from "./input.js";
import { RunJournal } from "./records.js";
import { executeAsset } from "./run.js";

declare const MANUS_PACKAGE: TaskPackage;
declare const MANUS_ENTRY_MODE: TaskEntryMode;
async function main(pkg: TaskPackage): Promise<void> {
  const { asset } = pkg;
  const request = await readPackageInput(MANUS_ENTRY_MODE, asset.method);
  if (!request) {
    text(
      "未提交新任务，本次已结束。原任务未执行；可在 TUI 用 /poa fg 再次打开新任务入口。",
    );
    return;
  }
  const journal = await RunJournal.open(
    asset.method,
    asset.config,
    request.mode,
    asset,
  );
  try {
    await writeFiles(`${journal.paths.runDirectory}/resources`, pkg.resources);
    await journal.setRequest(
      request.mode === "replay" ? pkg.originalRequest : request.request,
    );
    const input =
      request.mode === "replay"
        ? pkg.originalInput
        : await captureInput("text", request.request);
    await journal.setInput(input);
    const context = await loadContext({
      method: asset.method,
      ...journal.paths,
      domain: asset.domain,
      experiences: pkg.experiences,
    });
    journal.record.context = context;
    journal.record.conditions.tools = asset.dependencies.tools;
    await writeFiles(journal.paths.runDirectory, {
      "context.json": JSON.stringify(context, null, 2),
    });
    await journal.trace({ type: "context_selected", context });
    await journal.saveAsset(pkg);
    await journal.trace({
      type: "asset_reused",
      assetId: asset.assetId,
      mode: request.mode,
    });
    notify(
      `复用资产 ${asset.assetId}，直接执行保存的方法。历史经历 ${context.episodes.length} 条。`,
    );
    await executeAsset(pkg, journal);
  } catch (error) {
    await journal.fail(error);
    if (journal.record.input) await journal.saveAsset(pkg, true);
    await journal.updateIndex();
    notify(`执行失败，记录：${journal.paths.runDirectory}`);
    throw error;
  }
}
await main(MANUS_PACKAGE);
