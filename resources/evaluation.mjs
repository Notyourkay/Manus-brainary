import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function readEvaluation(directory) {
  const json = async (name) =>
    JSON.parse(await readFile(join(directory, name), "utf8"));
  const optional = async (name) => {
    try {
      return await readFile(join(directory, name), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  };
  const hash = (text) => createHash("sha256").update(text).digest("hex");
  const record = await json("record.json");
  const trace = (await readFile(join(directory, "trace.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  const calls = await optional("tool-calls.jsonl"),
    reportText = await optional("report.json");
  let report = null;
  if (reportText !== null) {
    try {
      report = JSON.parse(reportText);
    } catch {
      report = { invalidJson: true };
    }
  }
  /** @type {Record<string, string>} */
  const resourceHashes = {};
  for (const name of ["table-core.mjs", "order-tools.mjs"])
    resourceHashes[name] = hash(
      await readFile(join(directory, "resources", name), "utf8"),
    );
  return {
    record,
    trace: trace.map((event) => ({
      type: event.type,
      ...(event.definition ? { definition: { id: event.definition.id } } : {}),
      ...(event.agentId ? { agentId: event.agentId } : {}),
      ...(event.definitionId ? { definitionId: event.definitionId } : {}),
    })),
    receipts: calls
      ? calls.trim().split("\n").filter(Boolean).map(JSON.parse)
      : [],
    report,
    reportHash: reportText === null ? null : hash(reportText),
    contextSha256: hash(JSON.stringify(record.context)),
    requestSha256: hash(record.request),
    actualInputSha256: record.input ? hash(record.input.content) : null,
    resourceHashes,
  };
}
