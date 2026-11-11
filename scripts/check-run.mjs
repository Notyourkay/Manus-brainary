import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const [directory, originalDirectory] = process.argv.slice(2);
if (!directory)
  throw new Error(
    "Usage: node scripts/check-run.mjs <run-directory> [original-run-directory]",
  );
const root = resolve(directory);
const record = JSON.parse(await readFile(join(root, "record.json"), "utf8"));
const snapshot = JSON.parse(
  await readFile(join(root, "wm-snapshot.json"), "utf8"),
);
const trace = (await readFile(join(root, "trace.jsonl"), "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const result = await readFile(join(root, "result.md"), "utf8");

assert.equal(record.status, "completed", "运行必须完成");
assert.equal(record.execution.status, "completed");
assert.equal(result, record.execution.finalOutput, "结果文件应与运行记录一致");
assert.deepEqual(
  JSON.parse(snapshot.record),
  record,
  "WM 读回快照应与运行记录一致",
);
assert.equal(trace[0].type, "run_started");
assert.equal(trace.at(-1).type, "run_finished");
for (const event of trace) {
  assert.equal(event.runId, record.runId);
  assert.equal(event.assetId, record.assetId);
  assert.ok(Number.isFinite(Date.parse(event.time)), "轨迹需要有效时间戳");
}
assert.deepEqual(
  record.execution.steps.map((step) => step.stepId),
  record.bundle.steps.map((step) => step.id),
);
const calls = trace.filter((event) => event.type === "agent_requested");
const created = trace.filter((event) => event.type === "agent_created");
assert.equal(created.length, calls.length, "每次调用应记录实例标识");
assert.equal(
  trace.filter((event) => event.type === "agent_completed").length,
  calls.length,
);
assert.equal(
  trace.filter((event) => event.type === "agent_closed").length,
  calls.length,
);
const generations = calls.filter(
  (event) => event.definition.id === "manus-generator",
).length;
assert.equal(
  generations,
  record.mode === "generate" ? 1 : 0,
  "复用运行不应重新生成方案",
);

if (originalDirectory) {
  const original = JSON.parse(
    await readFile(join(resolve(originalDirectory), "record.json"), "utf8"),
  );
  assert.equal(record.mode, "replay");
  assert.equal(record.assetId, original.assetId);
  assert.notEqual(record.runId, original.runId);
  assert.deepEqual(record.bundle, original.bundle, "复用原定义与方案");
  const originalIds = new Set(
    original.execution.steps.flatMap((step) =>
      step.attempts.flatMap((attempt) => [attempt.agentId, attempt.reviewerId]),
    ),
  );
  for (const event of created)
    assert.ok(!originalIds.has(event.agentId), "复用运行应创建新实例");
}

console.log(
  JSON.stringify(
    {
      verified: true,
      runId: record.runId,
      assetId: record.assetId,
      mode: record.mode,
      steps: record.execution.steps.length,
      agentCalls: calls.length,
      generatorCalls: generations,
      revisions: trace.filter((event) => event.type === "step_revision").length,
      elapsedSeconds:
        (Date.parse(record.finishedAt) - Date.parse(record.startedAt)) / 1000,
      traceEvents: trace.length,
    },
    null,
    2,
  ),
);
