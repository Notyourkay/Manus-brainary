import { BrainaryTool } from "@brainary/poa-sdk";
import { describe, expect, it } from "vitest";
import domain from "../knowledge/order-audit.json";
import { config } from "../src/config.js";
import { defaultStrategy, type RsiSource } from "../src/rsi/contracts.js";
import { parseReflection, reflect } from "../src/rsi/proposal.js";
import { parseSource } from "../src/rsi/store.js";
import fixture from "./fixtures/bundle.json";

const bundle = {
  ...fixture,
  agents: [{ ...fixture.agents[0], tools: [BrainaryTool.exec_command] }],
  steps: [
    { ...fixture.steps[0], knowledgeRefs: domain.rules.map((rule) => rule.id) },
  ],
};
const source = {
  record: { runId: "real", context: { domain, experiences: [], episodes: [] } },
  pkg: {
    asset: {
      config,
      method: { objective: "订单", scenario: "order-audit", inputKind: "csv" },
    },
    originalInput: { source: "/orders.csv" },
  },
} as unknown as RsiSource;
const reflection = {
  diagnosis: "清单步骤可合并",
  sourceRunIds: ["real"],
  experiences: [{ content: "在执行中使用规则", applicability: "订单" }],
  innerBundle: bundle,
  strategyInstructions: "单步执行",
};
describe("real reflection parser", () => {
  it("preserves valid candidate definitions and source references", () => {
    expect(parseReflection(JSON.stringify(reflection), source)).toEqual(
      reflection,
    );
  });
  it("repairs a concrete contract error once and keeps both raw replies", async () => {
    const raw: string[] = [];
    const messages: string[] = [];
    const result = await reflect(
      source,
      defaultStrategy("order-audit"),
      async (_definition, message) => {
        messages.push(message);
        return {
          agentId: "test-reflector",
          text: JSON.stringify(
            messages.length === 1
              ? { ...reflection, type: "object" }
              : reflection,
          ),
        };
      },
      async (text) => {
        raw.push(text);
      },
    );
    expect(result).toEqual(reflection);
    expect(raw).toHaveLength(2);
    expect(messages[1]).toContain("must NOT have additional properties");
    let calls = 0;
    await expect(
      reflect(
        source,
        defaultStrategy("order-audit"),
        async () => {
          calls++;
          return { agentId: "invalid-reflector", text: "{}" };
        },
        async () => {},
      ),
    ).rejects.toThrow("契约");
    expect(calls).toBe(2);
  });
  it("rejects invented origins, tools and missing domain coverage", () => {
    expect(() =>
      parseReflection(
        JSON.stringify({ ...reflection, sourceRunIds: ["invented"] }),
        source,
      ),
    ).toThrow("来源运行");
    const unknown = structuredClone(reflection);
    unknown.innerBundle.agents[0].tools = ["invented" as BrainaryTool];
    expect(() => parseReflection(JSON.stringify(unknown), source)).toThrow(
      "未提供工具",
    );
    const missing = structuredClone(reflection);
    missing.innerBundle.steps[0].knowledgeRefs = [];
    expect(() => parseReflection(JSON.stringify(missing), source)).toThrow(
      "未覆盖",
    );
  });
  it("rejects unfinished or mismatched source assets at the entry boundary", () => {
    expect(() =>
      parseSource({
        directory: "/run",
        record: { version: 2, status: "running" } as RsiSource["record"],
        asset: { version: 2 } as RsiSource["pkg"]["asset"],
        resources: {},
        hashes: {},
        toolReceipts: [],
        agentCalls: 0,
      }),
    ).toThrow("已结束");
  });
});
