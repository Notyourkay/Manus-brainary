import { BrainaryTool } from "@brainary/poa-sdk";
import { describe, expect, it } from "vitest";
import { parseBundle, parseReview } from "../src/bundle.js";
import fixture from "./fixtures/bundle.json";

describe("generation boundary", () => {
  it("accepts fenced JSON and keeps generated roles and dependencies", () => {
    const bundle = parseBundle(
      `\x60\x60\x60json\n${JSON.stringify(fixture)}\n\x60\x60\x60`,
      [],
    );
    expect(bundle).toEqual(fixture);
  });

  it("rejects a plan without concrete acceptance criteria", () => {
    const invalid = structuredClone(fixture);
    invalid.steps[0].acceptanceCriteria = [];
    expect(() => parseBundle(JSON.stringify(invalid), [])).toThrow("契约");
  });

  it("rejects missing agent definitions and forward dependencies", () => {
    const invalid = structuredClone(fixture);
    invalid.steps[0].agentId = "missing";
    expect(() => parseBundle(JSON.stringify(invalid), [])).toThrow(
      "不存在的 Agent",
    );
    invalid.steps[0].agentId = "reader";
    invalid.steps[0].inputFrom = ["answer"];
    expect(() => parseBundle(JSON.stringify(invalid), [])).toThrow("前置步骤");
  });

  it("rejects duplicate identifiers instead of overwriting results", () => {
    const invalid = structuredClone(fixture);
    invalid.steps[1].id = "extract";
    expect(() => parseBundle(JSON.stringify(invalid), [])).toThrow("ID 重复");
  });

  it("checks requested tools against the current task environment", () => {
    const withTool = parseBundle(JSON.stringify(fixture), []);
    withTool.agents[0].tools = [BrainaryTool.exec_command];
    expect(() => parseBundle(JSON.stringify(withTool), [])).toThrow(
      "未提供工具",
    );
    expect(
      parseBundle(JSON.stringify(withTool), [BrainaryTool.exec_command])
        .agents[0].tools,
    ).toEqual([BrainaryTool.exec_command]);
  });

  it("rejects malformed model replies and invalid review booleans", () => {
    expect(() => parseBundle("无法生成", [])).toThrow("JSON");
    expect(() => parseReview('{"passed":"yes","feedback":"通过"}')).toThrow(
      "契约",
    );
    expect(parseReview('{"passed":false,"feedback":"缺少要求 B"}')).toEqual({
      passed: false,
      feedback: "缺少要求 B",
    });
  });
});
