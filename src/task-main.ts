import { notify } from "@brainary/poa-sdk";
import { loadContext } from "./context.js";
import type { TaskPackage } from "./contracts.js";
import { writeFiles } from "./files.js";
import { captureInput, readPackageInput } from "./input.js";
import { RunJournal } from "./records.js";
import { executeAsset } from "./run.js";

declare const MANUS_PACKAGE: TaskPackage;
async function main(pkg: TaskPackage): Promise<void> {
  const request = await readPackageInput();
  const { asset } = pkg;
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
