import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadLearning(root) {
  let state;
  try {
    state = JSON.parse(
      await readFile(join(root, "learning/state.json"), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT")
      return { version: 1, strategies: {}, experiences: [] };
    throw error;
  }
  validateLearning(state);
  return state;
}

export async function publishLearning(root, update) {
  const current = await loadLearning(root);
  const state = {
    version: 1,
    strategies: { ...current.strategies, ...update.strategies },
    experiences: [
      ...new Map(
        [...current.experiences, ...update.experiences].map((item) => [
          item.id,
          item,
        ]),
      ).values(),
    ],
  };
  validateLearning(state);
  await mkdir(join(root, "learning"), { recursive: true });
  await writeFile(
    join(root, "learning/state.json"),
    JSON.stringify(state, null, 2),
  );
  return state;
}

function validateLearning(state) {
  if (
    state?.version !== 1 ||
    !state.strategies ||
    !Array.isArray(state.experiences)
  )
    throw new Error("经验存储格式不符合版本 1 契约。");
  for (const [scenario, strategy] of Object.entries(state.strategies)) {
    if (
      !["text", "order-audit"].includes(scenario) ||
      strategy.scenario !== scenario ||
      typeof strategy.id !== "string" ||
      typeof strategy.instructions !== "string" ||
      !(strategy.parentId === null || typeof strategy.parentId === "string") ||
      typeof strategy.createdAt !== "string" ||
      !Array.isArray(strategy.sourceRunIds) ||
      !strategy.sourceRunIds.every((id) => typeof id === "string")
    )
      throw new Error("生成策略缺少有效的版本、场景或来源。");
  }
  for (const item of state.experiences) {
    if (
      !["id", "version", "content", "source", "applicability"].every(
        (key) => typeof item[key] === "string" && item[key].trim(),
      ) ||
      !["text", "order-audit"].includes(item.scenario) ||
      item.provenance?.status !== "validated" ||
      typeof item.provenance.cycleId !== "string" ||
      typeof item.provenance.scope !== "string" ||
      !["sourceRunIds", "evaluationRunIds", "caseIds"].every(
        (key) =>
          Array.isArray(item.provenance[key]) &&
          item.provenance[key].length > 0 &&
          item.provenance[key].every((id) => typeof id === "string"),
      )
    )
      throw new Error(
        "自动经验必须附带适用条件、来源和已验证范围；候选不能发布。",
      );
  }
}
