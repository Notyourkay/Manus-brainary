import { describe, expect, it } from "vitest";
import { compareEvaluations } from "../src/rsi/comparison.js";
import type { EvaluationRow } from "../src/rsi/contracts.js";

const row = (caseId: string, calls: number, passed = true): EvaluationRow => ({
  caseId,
  inputSha256: caseId,
  requestSha256: `request-${caseId}`,
  runId: `run-${caseId}`,
  assetId: "asset",
  runDirectory: "/tmp/run",
  conditions: { model: "model", context: "frozen" },
  passed,
  acceptanceKind: "objective",
  checksPassed: passed ? 13 : 12,
  checksTotal: 13,
  agentCalls: calls,
  toolCalls: 2,
  elapsedMs: 1,
  error: null,
});
describe("RSI deterministic adoption", () => {
  it("accepts genuine failure repair or fewer calls without per-case regressions", () => {
    expect(
      compareEvaluations(
        [row("a", 4, false), row("b", 4)],
        [row("a", 4), row("b", 4)],
      ).adopted,
    ).toBe(true);
    expect(
      compareEvaluations([row("a", 4), row("b", 4)], [row("a", 2), row("b", 2)])
        .adopted,
    ).toBe(true);
  });
  it("retains baseline for ties, regressions, model-only and hidden per-case cost growth", () => {
    const baseline = [row("a", 4), row("b", 4)];
    for (const candidate of [
      baseline,
      [row("a", 2), row("b", 2, false)],
      [{ ...row("a", 2), acceptanceKind: "model-only" }, row("b", 2)],
      [row("a", 2), row("b", 5)],
    ])
      expect(compareEvaluations(baseline, candidate).adopted).toBe(false);
  });
  it("rejects missing/duplicate cases or mismatched inputs, requests and conditions", () => {
    const baseline = [row("a", 4), row("b", 4)];
    for (const changes of [
      { inputSha256: "other" },
      { requestSha256: "other" },
      { conditions: { model: "other" } },
    ])
      expect(
        compareEvaluations(baseline, [
          { ...row("a", 2), ...changes },
          row("b", 2),
        ]).adopted,
      ).toBe(false);
    expect(compareEvaluations(baseline, [row("a", 2)]).adopted).toBe(false);
    expect(
      compareEvaluations(baseline, [row("a", 2), row("a", 2)]).adopted,
    ).toBe(false);
    expect(compareEvaluations([], []).adopted).toBe(false);
  });
});
