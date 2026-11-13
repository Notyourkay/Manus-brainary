import type { RunRecord, ToolReceipt, TraceEvent } from "../contracts.js";
import { validateOrderRun } from "../validation.js";
import type { EvaluationRow } from "./contracts.js";

export interface EvaluationEvidence {
  record: RunRecord;
  trace: TraceEvent[];
  receipts: ToolReceipt[];
  report: unknown;
  reportHash: string | null;
  contextSha256: string;
  requestSha256: string;
  actualInputSha256: string | null;
  resourceHashes: Record<string, string>;
}

export function measureEvaluation(
  evidence: EvaluationEvidence,
  runDirectory: string,
): EvaluationRow {
  const { record } = evidence;
  const acceptance =
    record.input && record.context?.domain && record.bundle
      ? validateOrderRun({
          input: record.input,
          domain: record.context.domain,
          bundle: record.bundle,
          report: evidence.report,
          reportHash: evidence.reportHash,
          receipts: evidence.receipts,
          agentIds:
            record.execution?.steps.flatMap((step) =>
              step.attempts.map((attempt) => attempt.agentId),
            ) ?? [],
        })
      : null;
  return {
    caseId: record.evaluation?.caseId ?? "",
    inputSha256: evidence.actualInputSha256 ?? "",
    requestSha256: evidence.requestSha256,
    runId: record.runId,
    assetId: record.assetId,
    runDirectory,
    conditions: {
      model: record.conditions.model,
      availableTools: record.config.availableTools,
      sdk: record.conditions.sdkVersion,
      brainary: record.conditions.requiredBrainary,
      node: record.conditions.node,
      platform: record.conditions.platform,
      arch: record.conditions.arch,
      executorVersion: record.executorVersion,
      generatorVersion: record.generatorVersion,
      agentTimeoutMs: record.config.agentTimeoutMs,
      contextSha256: evidence.contextSha256,
      resourceHashes: evidence.resourceHashes,
      evaluatorVersion: "orders-13-v1",
    },
    passed:
      record.status === "completed" &&
      record.execution?.status === "completed" &&
      acceptance?.passed === true &&
      record.input?.sha256 === evidence.actualInputSha256,
    acceptanceKind: acceptance?.kind ?? null,
    checksPassed:
      acceptance?.checks.filter((check) => check.passed).length ?? 0,
    checksTotal: acceptance?.checks.length ?? 0,
    agentCalls: evidence.trace.filter(
      (event) => event.type === "agent_requested",
    ).length,
    toolCalls: evidence.receipts.length,
    elapsedMs:
      Date.parse(record.finishedAt ?? record.startedAt) -
      Date.parse(record.startedAt),
    error: record.error,
  };
}
