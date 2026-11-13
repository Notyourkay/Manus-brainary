import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadLearning, publishLearning } from "../resources/learning.mjs";
import { bundledExperiences, selectContext } from "../src/context.js";
import { defaultStrategy } from "../src/rsi/contracts.js";

describe("real learning storage", () => {
  it("persists only validated experiences and coexists with manual knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "manus-learning-"));
    try {
      expect(await loadLearning(root)).toEqual({
        version: 1,
        strategies: {},
        experiences: [],
      });
      const experience = {
        id: "learned",
        version: "1",
        scenario: "order-audit",
        content: "将规则清单合并进工具执行步骤",
        source: "cycle/reflection.json",
        applicability: "简单订单核对",
        provenance: {
          status: "validated",
          cycleId: "cycle",
          sourceRunIds: ["source"],
          evaluationRunIds: ["eval"],
          caseIds: ["a"],
          scope: "本轮组合验证",
        },
      };
      await expect(
        publishLearning(root, {
          strategies: {},
          experiences: [
            {
              ...experience,
              provenance: { ...experience.provenance, status: "candidate" },
            },
          ],
        }),
      ).rejects.toThrow("候选不能发布");
      const strategy = {
        ...defaultStrategy("order-audit"),
        id: "strategy",
        instructions: "合并规则与执行",
      };
      await publishLearning(root, {
        strategies: { "order-audit": strategy },
        experiences: [experience],
      });
      await publishLearning(root, {
        strategies: { text: defaultStrategy("text") },
        experiences: [],
      });
      const loaded = await loadLearning(root);
      expect(loaded.strategies["order-audit"]).toEqual(strategy);
      const context = selectContext(
        { scenario: "order-audit", inputKind: "csv", objective: "核对订单" },
        [...bundledExperiences, ...loaded.experiences],
        [],
      );
      expect(context.experiences.map((item) => item.id)).toEqual([
        "orders-check-balance",
        "learned",
      ]);
      expect(context.experiences[1].provenance?.evaluationRunIds).toEqual([
        "eval",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
