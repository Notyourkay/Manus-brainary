import { describe, expect, it } from "vitest";
import { parseCognitiveReview } from "../src/metacognition.js";

const review = {
  passed: false,
  feedback: "补足目标 B",
  coverage: [{ goal: "B", status: "missing", evidenceRefs: ["output"] }],
  progress: "A 完成，B 缺失",
  problems: [{ kind: "gap", detail: "缺 B", evidenceRefs: ["output"] }],
};
describe("metacognition output boundary", () => {
  it("preserves coverage, progress, problems and observed references", () => {
    expect(parseCognitiveReview(JSON.stringify(review), ["output"])).toEqual(
      review,
    );
  });
  it("rejects invented references and unstructured verdicts", () => {
    expect(() =>
      parseCognitiveReview(JSON.stringify(review), ["actual"]),
    ).toThrow("未读取");
    expect(() =>
      parseCognitiveReview(
        JSON.stringify({ passed: true, feedback: "good" }),
        [],
      ),
    ).toThrow("契约");
  });
});
