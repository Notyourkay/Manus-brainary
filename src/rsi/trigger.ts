import type { RunRecord } from "../contracts.js";
import type { RsiDecision } from "../monitoring.js";

export function decideRsi(record: RunRecord): RsiDecision {
  const checks = record.monitoring?.checks ?? [];
  const signals = checks.filter(
    (c) =>
      !c.review.passed ||
      c.review.problems.some(
        (p) => p.kind === "redundancy" && p.evidenceRefs.length,
      ),
  );
  const decision: RsiDecision = {
    status: "skipped",
    eligible: false,
    reasons: [],
    sourceChecks: signals.map((c) => c.resultRef),
    cycleId: "",
    directory: "",
    error: "",
  };
  if (record.evaluation || record.mode === "evaluate") {
    decision.reasons.push("评估运行不递归触发 RSI");
    return decision;
  }
  if (record.status === "running" || !record.finishedAt) {
    decision.reasons.push("任务尚未结束");
    return decision;
  }
  if (
    record.method.scenario !== "order-audit" ||
    !record.input ||
    record.input.source === "user:text" ||
    !record.bundle ||
    !record.context?.domain
  ) {
    decision.reasons.push(
      "本版自动 RSI 需要完整订单资产、资料快照与客观评估套件",
    );
    return decision;
  }
  if (signals.some((c) => !c.review.passed))
    decision.reasons.push("元认知记录存在检查失败");
  if (record.monitoring?.revisions) decision.reasons.push("任务内发生了纠偏");
  if (record.acceptance?.passed === false)
    decision.reasons.push("最终客观验收未通过");
  if (
    signals.some((c) => c.review.problems.some((p) => p.kind === "redundancy"))
  )
    decision.reasons.push("元认知发现有证据支持的冗余步骤");
  if (!decision.reasons.length) {
    decision.reasons.push("没有失败、纠偏或冗余证据，无需自动 RSI");
    return decision;
  }
  decision.eligible = true;
  decision.status = record.mode === "generate" ? "pending" : "recommended";
  if (record.mode !== "generate")
    decision.reasons.push("独立任务包只记录建议，可从 Manus 主动复盘");
  return decision;
}
