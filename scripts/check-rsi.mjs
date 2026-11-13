import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { compareEvaluations } from "../dist/rsi-comparison.mjs";
import { measureEvaluation } from "../dist/rsi-measurement.mjs";
import { readEvaluation } from "../resources/evaluation.mjs";
import { loadLearning } from "../resources/learning.mjs";

const directory = process.argv[2];
if (!directory)
  throw new Error(
    "Usage: node scripts/check-rsi.mjs <cycle-directory>; run pnpm build first.",
  );
const root = resolve(directory);
const json = async (name) =>
  JSON.parse(await readFile(join(root, name), "utf8"));
const hash = (text) => createHash("sha256").update(text).digest("hex");
const result = await json("result.json"),
  source = await json("source.json"),
  suite = await json("cases.json"),
  context = await json("context.json");
const reflection = await json("reflection.json"),
  strategy = await json("outer-candidate.json"),
  baselineStrategy = await json("baseline-strategy.json");
assert.equal(result.status, "completed");
assert.equal(result.publication, "completed");
assert.equal(result.sourceRunId, source.record.runId);
assert.deepEqual(reflection.sourceRunIds, [source.record.runId]);
assert.deepEqual(strategy.sourceRunIds, [source.record.runId]);
assert.equal(strategy.parentId, baselineStrategy.id);
const ids = new Set();
for (const target of ["inner", "outer"]) {
  const comparison = await json(`${target}-comparison.json`);
  for (const arm of ["baseline", "candidate"]) {
    assert.deepEqual(
      comparison[arm].map((row) => row.caseId),
      suite[target],
    );
    for (const row of comparison[arm]) {
      const test = suite.cases.find((item) => item.id === row.caseId);
      assert.equal(hash(test.input.content), test.input.sha256);
      const evidence = await readEvaluation(row.runDirectory);
      const measured = measureEvaluation(evidence, row.runDirectory);
      assert.deepEqual(measured, row, "保存的指标必须与实际运行重新计算一致");
      assert.ok(!ids.has(row.runId), "双方必须是真正独立的运行");
      ids.add(row.runId);
      assert.deepEqual(evidence.record.evaluation, {
        cycleId: result.cycleId,
        target,
        arm,
        caseId: test.id,
      });
      assert.equal(evidence.record.request, test.request);
      assert.equal(row.inputSha256, test.input.sha256);
      assert.deepEqual(evidence.record.context, context);
      assert.equal(row.conditions.contextSha256, hash(JSON.stringify(context)));
      if (target === "inner")
        assert.deepEqual(
          evidence.record.bundle,
          arm === "baseline" ? source.pkg.asset.bundle : reflection.innerBundle,
        );
      else
        assert.deepEqual(
          evidence.record.generationStrategy,
          arm === "baseline" ? baselineStrategy : strategy,
        );
      const requested = evidence.trace.filter(
        (event) => event.type === "agent_requested",
      );
      assert.equal(
        requested.filter((event) => event.definition.id === "manus-generator")
          .length,
        target === "outer" ? 1 : 0,
      );
      if (row.passed)
        execFileSync(
          process.execPath,
          [
            fileURLToPath(new URL("check-run.mjs", import.meta.url)),
            row.runDirectory,
          ],
          { stdio: "pipe" },
        );
    }
  }
  assert.deepEqual(
    compareEvaluations(comparison.baseline, comparison.candidate),
    comparison,
    "选择规则必须能重新计算",
  );
  assert.deepEqual(result[target], comparison);
}
for (const [path, digest] of Object.entries(source.hashes))
  assert.equal(hash(await readFile(path)), digest, `原资产被改变：${path}`);
const files = unzipSync(await readFile(result.selectedPackage));
const asset = JSON.parse(strFromU8(files["asset.json"]));
assert.equal(asset.assetId, result.selectedAssetId);
assert.deepEqual(
  asset.bundle,
  result.inner.adopted ? reflection.innerBundle : source.pkg.asset.bundle,
);
assert.equal(asset.lineage.parentAssetId, source.pkg.asset.assetId);
assert.equal(asset.lineage.cycleId, result.cycleId);
assert.deepEqual(
  JSON.parse(strFromU8(files["original-input.json"])),
  source.pkg.originalInput,
);
assert.deepEqual(JSON.parse(strFromU8(files["original-request.json"])), {
  request: source.pkg.originalRequest,
});
assert.equal(
  result.selectedStrategyId,
  (result.outer.adopted ? strategy : baselineStrategy).id,
);
const state = await loadLearning(result.memoryRoot);
const published = state.experiences.filter(
  (item) => item.provenance.cycleId === result.cycleId,
);
assert.deepEqual(
  published.map((item) => item.id),
  result.publishedExperienceIds,
);
assert.equal(
  published.length > 0,
  result.inner.adopted || result.outer.adopted,
);
const supporting = [
  ...(result.inner.adopted ? result.inner.candidate : []),
  ...(result.outer.adopted ? result.outer.candidate : []),
];
for (const experience of published) {
  assert.deepEqual(experience.provenance.sourceRunIds, [source.record.runId]);
  assert.deepEqual(
    experience.provenance.evaluationRunIds,
    supporting.map((row) => row.runId),
  );
}
console.log(
  JSON.stringify(
    {
      verified: true,
      cycleId: result.cycleId,
      inner: { adopted: result.inner.adopted, ...result.inner.totals },
      outer: { adopted: result.outer.adopted, ...result.outer.totals },
      originalAssetUnchanged: true,
      selectedPackage: result.selectedPackage,
      publishedExperienceIds: result.publishedExperienceIds,
    },
    null,
    2,
  ),
);
