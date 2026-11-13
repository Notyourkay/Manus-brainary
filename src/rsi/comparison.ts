import type { Comparison, EvaluationRow } from "./contracts.js";

export function compareEvaluations(
  baseline: EvaluationRow[],
  candidate: EvaluationRow[],
): Comparison {
  const totals = {
    baselinePassed: baseline.filter((row) => row.passed).length,
    candidatePassed: candidate.filter((row) => row.passed).length,
    baselineCalls: baseline.reduce((n, row) => n + row.agentCalls, 0),
    candidateCalls: candidate.reduce((n, row) => n + row.agentCalls, 0),
  };
  const result = (adopted: boolean, reason: string): Comparison => ({
    adopted,
    reason,
    baseline,
    candidate,
    totals,
  });
  if (
    baseline.length === 0 ||
    baseline.length !== candidate.length ||
    new Set(baseline.map((row) => row.caseId)).size !== baseline.length ||
    new Set(candidate.map((row) => row.caseId)).size !== candidate.length
  )
    return result(false, "保留基线：对照用例不完整或重复。");
  const matched = baseline.map((left) => ({
    left,
    right: candidate.find((row) => row.caseId === left.caseId),
  }));
  if (
    matched.some(
      ({ left, right }) =>
        !right ||
        left.inputSha256 !== right.inputSha256 ||
        left.requestSha256 !== right.requestSha256 ||
        canonical(left.conditions) !== canonical(right.conditions),
    )
  )
    return result(false, "保留基线：输入、请求或运行条件不一致。");
  if (
    candidate.some(
      (row) =>
        !row.passed ||
        row.acceptanceKind !== "objective" ||
        row.checksTotal !== 13 ||
        row.checksPassed !== 13 ||
        row.agentCalls < 2,
    )
  )
    return result(false, "保留基线：候选未全部通过固定客观检查。");
  if (totals.baselinePassed < baseline.length)
    return result(true, "采用候选：相同条件下修复了基线失败，全部用例通过。");
  if (
    totals.candidateCalls < totals.baselineCalls &&
    matched.every(
      ({ left, right }) =>
        (right as EvaluationRow).agentCalls <= left.agentCalls,
    )
  )
    return result(
      true,
      "采用候选：全部用例通过，每个用例调用不增加且总 Agent 调用减少。",
    );
  return result(false, "保留基线：未获得质量或 Agent 调用量改善。");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
