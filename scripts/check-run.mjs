import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateOrderRun } from "../dist/validation.mjs";

const [directory, originalDirectory] = process.argv.slice(2);
if (!directory)
  throw new Error(
    "Usage: node scripts/check-run.mjs <run-directory> [original-run-directory]; build first with pnpm build.",
  );
const root = resolve(directory);
const json = async (name) =>
  JSON.parse(await readFile(join(root, name), "utf8"));
const record = await json("record.json"),
  input = await json("input.json"),
  snapshot = await json("wm-snapshot.json"),
  acceptance = await json("acceptance.json");
assert.equal(record.version, 2, "此核查器用于 V1 优化后的格式版本 2 记录");
assert.equal(record.status, "completed");
assert.equal(record.execution.status, "completed");
assert.deepEqual(
  JSON.parse(snapshot.record),
  record,
  "WM 副本必须与最终记录一致",
);
assert.deepEqual(input, record.input);
assert.equal(
  createHash("sha256").update(input.content).digest("hex"),
  input.sha256,
);
assert.deepEqual(await json("context.json"), record.context);
const trace = (await readFile(join(root, "trace.jsonl"), "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
assert.equal(trace[0].type, "run_started");
assert.ok(
  trace.some(
    (event) => event.type === "run_finished" && event.status === "completed",
  ),
);
for (const event of trace) {
  assert.equal(event.runId, record.runId);
  assert.equal(event.assetId, record.assetId);
}
const requested = trace.filter((event) => event.type === "agent_requested");
const created = trace.filter((event) => event.type === "agent_created");
for (const type of [
  "agent_created",
  "agent_input",
  "agent_completed",
  "agent_closed",
])
  assert.equal(
    trace.filter((event) => event.type === type).length,
    requested.length,
    `缺少 ${type}`,
  );
const generatorCalls = requested.filter(
  (event) => event.definition.id === "manus-generator",
).length;
if (record.mode === "generate") assert.ok(generatorCalls >= 1);
else assert.equal(generatorCalls, 0);
assert.deepEqual(
  record.execution.steps.map((step) => step.stepId),
  record.bundle.steps.map((step) => step.id),
);
let toolCalls = 0;
if (record.method.scenario === "order-audit") {
  const reportText = await readFile(join(root, "report.json"), "utf8");
  const receipts = (await readFile(join(root, "tool-calls.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  for (const receipt of receipts) {
    assert.equal(receipt.runId, record.runId);
    assert.equal(receipt.assetId, record.assetId);
  }
  const verified = validateOrderRun({
    input,
    domain: record.context.domain,
    report: JSON.parse(reportText),
    reportHash: createHash("sha256").update(reportText).digest("hex"),
    receipts,
    bundle: record.bundle,
    agentIds: record.execution.steps.flatMap((step) =>
      step.attempts.map((attempt) => attempt.agentId),
    ),
  });
  assert.equal(
    verified.passed,
    true,
    JSON.stringify(verified.checks.filter((check) => !check.passed)),
  );
  assert.deepEqual(
    verified,
    record.acceptance,
    "重新检查必须与保存的客观结论一致",
  );
  assert.deepEqual(acceptance.checks, verified.checks);
  toolCalls = receipts.length;
}
const result = await readFile(join(root, "result.md"), "utf8");
assert.equal(result, record.execution.finalOutput);
if (originalDirectory) {
  const original = JSON.parse(
    await readFile(join(resolve(originalDirectory), "record.json"), "utf8"),
  );
  assert.equal(record.assetId, original.assetId);
  assert.notEqual(record.runId, original.runId);
  assert.deepEqual(record.method, original.method);
  assert.deepEqual(record.bundle, original.bundle);
  assert.equal(generatorCalls, 0);
  if (record.mode === "replay")
    assert.equal(input.sha256, original.input.sha256);
  const originalIds = new Set(
    original.execution.steps.flatMap((step) =>
      step.attempts.flatMap((attempt) => [attempt.agentId, attempt.reviewerId]),
    ),
  );
  for (const event of created)
    assert.ok(!originalIds.has(event.agentId), "复用应创建新实例");
}
console.log(
  JSON.stringify(
    {
      verified: true,
      runId: record.runId,
      assetId: record.assetId,
      mode: record.mode,
      inputSha256: input.sha256,
      generatorCalls,
      agentCalls: created.length,
      toolCalls,
      objectiveAcceptance: record.acceptance.kind === "objective",
      knowledge: record.context.domain?.id ?? null,
      experiences: record.context.experiences.map(
        (item) => `${item.id}@${item.version}`,
      ),
      episodes: record.context.episodes.map((item) => item.runId),
    },
    null,
    2,
  ),
);
