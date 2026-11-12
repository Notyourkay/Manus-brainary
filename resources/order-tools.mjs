import { createHash, randomUUID } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseOrders } from "./table-core.mjs";

const [operation, contextPath, payload] = process.argv.slice(2);
const context = JSON.parse(await readFile(contextPath, "utf8"));
const receipt = {
  callId: randomUUID(),
  agentId: context.agentId,
  runId: context.runId,
  assetId: context.assetId,
  operation,
  args: {
    inputPath: context.inputPath,
    reportPath: context.reportPath,
    payload: payload ?? null,
    argv: process.argv.slice(2),
  },
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status: "completed",
  result: null,
  error: null,
};
try {
  if (operation === "read") {
    const source = payload
      ? resolve(context.sourceRoot, payload)
      : context.inputPath;
    receipt.args.inputPath = source;
    const content = await readFile(source, "utf8");
    const rows = parseOrders(content);
    const sha256 = hash(content);
    if (payload) {
      await writeFile(context.inputPath, content);
      await writeFile(
        resolve(dirname(context.inputPath), "input.json"),
        JSON.stringify({ source, content, sha256 }, null, 2),
      );
    }
    receipt.result = { sourceSha256: sha256, rows };
  } else if (operation === "write") {
    const report = JSON.parse(payload);
    const content = `${JSON.stringify(report, null, 2)}\n`;
    await writeFile(context.reportPath, content);
    receipt.result = {
      reportPath: context.reportPath,
      sha256: hash(content),
      report,
    };
  } else throw new Error(`未知任务工具操作：${operation}`);
} catch (error) {
  receipt.status = "error";
  receipt.error = String(error);
  process.exitCode = 1;
}
receipt.finishedAt = new Date().toISOString();
await appendFile(context.receiptsPath, `${JSON.stringify(receipt)}\n`);
console.log(JSON.stringify(receipt));

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}
