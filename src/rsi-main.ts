import { runNode } from "./files.js";
import { askForTask } from "./input.js";
import { runCycle } from "./rsi/cycle.js";

const supplied = JSON.parse(
  await runNode(
    "console.log(JSON.stringify(process.env.MANUS_RSI_SOURCE || null));",
  ),
);
const directory =
  supplied ??
  (await askForTask(
    "请输入要复盘的订单运行目录（runs/<runId>）。本轮将生成候选、真实对照并选择版本。",
  ));
await runCycle(directory);
