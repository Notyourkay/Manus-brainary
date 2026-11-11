import { notify } from "@brainary/poa-sdk";
import type { TaskAsset } from "./contracts.js";
import { writeFiles } from "./files.js";
import { RunJournal } from "./records.js";
import { executeAsset } from "./run.js";

declare const MANUS_ASSET: TaskAsset;

async function main(asset: TaskAsset): Promise<void> {
  const journal = await RunJournal.open(asset.task, asset.config, asset);
  try {
    notify(`复用任务资产 ${asset.assetId}，直接执行已保存的方案。`);
    await writeFiles(journal.paths.assetDirectory, {
      "asset.json": JSON.stringify(asset, null, 2),
    });
    await journal.trace({ type: "asset_reused", assetId: asset.assetId });
    await executeAsset(asset, journal);
  } catch (error) {
    await journal.fail(error);
    notify(`执行失败，记录保存在 ${journal.paths.runDirectory}`);
    throw error;
  }
}

await main(MANUS_ASSET);
