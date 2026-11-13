import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateOrderRun } from "../dist/validation.mjs";
import {
  projectWorkingMemory,
  readWorkingMemory,
  storeWorkingMemory,
} from "../dist/working-memory.mjs";

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
if (snapshot.version >= 3) {
  assert.deepEqual(
    snapshot,
    storeWorkingMemory(projectWorkingMemory(record, root)),
    "WM 分区必须对应最终记录",
  );
  const wm = readWorkingMemory(snapshot);
  assert.equal(wm.task.runId, record.runId);
  assert.ok(
    record.monitoring.checks.some((c) => c.checkpoint === "plan_completed"),
  );
  assert.ok(
    record.monitoring.checks.some((c) => c.checkpoint === "task_completed"),
  );
  assert.ok(!("record" in snapshot));
  for (const check of record.monitoring.checks) {
    assert.deepEqual(
      JSON.parse(await readFile(check.resultRef, "utf8")),
      check,
    );
    const state = JSON.parse(await readFile(check.wmRef, "utf8"));
    assert.equal(state.task.runId, record.runId);
    assert.equal(state.metacognition.checkpoint, check.checkpoint);
    if (snapshot.version === 4 && check.checkpoint === "task_completed") {
      assert.equal(state.task.status, "running");
      assert.equal(state.execution.status, "checking");
      assert.equal(state.execution.activeStep, "");
      assert.equal(state.execution.attempt, 0);
    }
    const documents = JSON.parse(await readFile(check.evidenceRef, "utf8"));
    for (const item of [...check.review.coverage, ...check.review.problems])
      for (const ref of item.evidenceRefs)
        assert.ok(
          ref in documents ||
            Object.values(documents).some((d) => d.ref === ref),
          `检查引用缺少实际读回证据：${ref}`,
        );
    if (!check.review.passed) {
      const failed = await json(`checks/${check.id}-failed-wm.json`);
      assert.equal(failed.metacognition.checkpoint, "check_failed");
    }
  }
  if (record.evaluation) assert.equal(record.rsi.status, "skipped");
} else
  assert.deepEqual(JSON.parse(snapshot.record), record, "历史 WM 与记录一致");
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
if (snapshot.version === 4) {
  const wm = readWorkingMemory(snapshot);
  assert.equal(
    wm.generation.status,
    record.mode === "generate" ? "generated" : "reused",
  );
  assert.equal(wm.generation.pendingQuestion, "");
  assert.equal(wm.execution.status, record.status);
  assert.equal(wm.execution.activeStep, "");
  assert.equal(wm.execution.attempt, 0);
  let current;
  let step;
  let attempt = 0;
  for (const [index, event] of trace.entries()) {
    if (event.type === "wm_state_updated") current = event;
    if (event.type === "step_started") {
      step = event.step.id;
      attempt = 0;
      assert.equal(trace[index + 1].execution.activeStep, step);
      assert.equal(trace[index + 1].execution.attempt, 0);
    }
    if (event.type === "attempt_started") {
      attempt = event.attempt;
      assert.equal(trace[index + 1].execution.activeStep, event.stepId);
      assert.equal(trace[index + 1].execution.attempt, attempt);
      assert.equal(trace[index + 1].execution.status, "running");
    }
    if (event.type === "clarification_requested") {
      assert.equal(current.generation.status, "awaiting_input");
      assert.equal(current.generation.pendingQuestion, event.question);
    }
    if (event.type === "agent_requested") {
      if (event.definition.id === "manus-generator") {
        assert.equal(current.generation.status, "generating");
        assert.equal(current.generation.pendingQuestion, "");
      } else if (
        record.bundle.agents.some((agent) => agent.id === event.definition.id)
      ) {
        assert.equal(current.execution.status, "running");
        assert.equal(current.execution.activeStep, step);
        assert.equal(current.execution.attempt, attempt);
        assert.equal(current.execution.outputRef, "");
      }
    }
  }
}
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
if (snapshot.version >= 3) {
  for (const check of record.monitoring.checks) {
    const consumed = trace.find(
      (e) => e.type === "agent_input" && e.agentId === check.reviewerId,
    );
    assert.ok(consumed, "检查必须存在实际 Agent 输入");
    const message = JSON.parse(consumed.message);
    assert.deepEqual(
      message.workingMemory,
      JSON.parse(await readFile(check.wmRef, "utf8")),
    );
    assert.deepEqual(
      message.documents,
      JSON.parse(await readFile(check.evidenceRef, "utf8")),
    );
  }
  const completion = record.monitoring.checks.at(-1);
  assert.equal(completion.checkpoint, "task_completed");
  assert.equal(completion.review.passed, true);
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
