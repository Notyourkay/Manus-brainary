import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { bundledExperiences, selectContext } from "../src/context.js";
import { parseGeneration } from "../src/generator.js";
import fixture from "./fixtures/bundle.json";

const method = {
  objective: "解释实用方法",
  scenario: "text" as const,
  inputKind: "text" as const,
};
const context = selectContext(method, bundledExperiences, []);

describe("outer Manus interpretation contract", () => {
  it("can generate without separate materials and can ask a necessary question", () => {
    const reply = { status: "ready", method, material: null, bundle: fixture };
    expect(parseGeneration(JSON.stringify(reply), context, config)).toEqual(
      reply,
    );
    expect(
      parseGeneration(
        JSON.stringify({
          status: "clarify",
          question: "要核对的订单数据在哪里？",
        }),
        context,
        config,
      ),
    ).toEqual({ status: "clarify", question: "要核对的订单数据在哪里？" });
  });
  it("rejects an order plan with no actual input or required tools", () => {
    const orders = {
      objective: "订单结算核对",
      scenario: "order-audit" as const,
      inputKind: "csv" as const,
    };
    const ctx = selectContext(orders, bundledExperiences, []);
    expect(() =>
      parseGeneration(
        JSON.stringify({
          status: "ready",
          method: orders,
          material: null,
          bundle: fixture,
        }),
        ctx,
        config,
      ),
    ).toThrow("澄清");
    expect(() =>
      parseGeneration(
        JSON.stringify({
          status: "ready",
          method: orders,
          material: "orders.csv",
          bundle: fixture,
        }),
        ctx,
        config,
      ),
    ).toThrow("工具");
  });
});
