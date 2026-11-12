import { describe, expect, it } from "vitest";
import { parseBundle } from "../src/bundle.js";
import {
  bundledExperiences,
  parseExperiences,
  selectContext,
} from "../src/context.js";
import fixture from "./fixtures/bundle.json";

describe("domain and manual experience selection", () => {
  it("selects source-versioned order rules and relevant experience only", () => {
    const selected = selectContext(
      { objective: "订单核对", scenario: "order-audit", inputKind: "csv" },
      bundledExperiences,
      [],
    );
    expect(selected.domain?.rules.map((rule) => rule.id)).toContain(
      "orders.exclude-cancelled",
    );
    expect(selected.domain?.version).toBe("1.0.0");
    expect(selected.experiences.map((item) => item.id)).toEqual([
      "orders-check-balance",
    ]);
    const plain = selectContext(
      { objective: "整理文字", scenario: "text", inputKind: "text" },
      bundledExperiences,
      [],
    );
    expect(plain.domain).toBeNull();
    expect(plain.experiences.map((item) => item.id)).toEqual([
      "text-preserve-unknown",
    ]);
  });
  it("keeps the actual manual file source and rejects untraceable entries", () => {
    const [experience] = parseExperiences(
      [{ ...bundledExperiences[0], version: "1.1.0" }],
      "/tmp/manual.json",
    );
    expect(experience.version).toBe("1.1.0");
    expect(experience.source).toContain(
      "/tmp/manual.json#orders-check-balance",
    );
    expect(() => parseExperiences([{ content: "无来源" }], "x")).toThrow(
      "来源",
    );
  });
  it("requires plan citations to refer to selected knowledge", () => {
    const bundle = parseBundle(JSON.stringify(fixture), []);
    bundle.steps[0].knowledgeRefs = ["invented-rule"];
    expect(() =>
      parseBundle(JSON.stringify(bundle), [], ["orders.exclude-cancelled"]),
    ).toThrow("未知知识引用");
  });
});
