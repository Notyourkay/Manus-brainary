import type { RunRecord } from "./contracts.js";

// SDK 的闭合对象足以表达这些逻辑分区；完整事件与模型输出仍在文件中。
const string = { type: "string" },
  integer = { type: "integer" },
  boolean = { type: "boolean" };
function object(properties: Record<string, unknown>) {
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}
const partitionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "manus-working-memory-v3",
  ...object({
    version: integer,
    task: object({
      runId: string,
      assetId: string,
      mode: string,
      status: string,
      request: string,
      objective: string,
      scenario: string,
      inputSha256: string,
      error: string,
    }),
    generation: object({
      status: string,
      strategyId: string,
      summary: string,
      agentCount: integer,
      stepCount: integer,
      bundleRef: string,
      contextRef: string,
    }),
    execution: object({
      status: string,
      activeStep: string,
      attempt: integer,
      completedSteps: integer,
      totalSteps: integer,
      toolCalls: integer,
      toolErrors: integer,
      outputRef: string,
      stepsRef: string,
    }),
    metacognition: object({
      checkpoint: string,
      checkCount: integer,
      failedChecks: integer,
      revisions: integer,
      coverage: string,
      progress: string,
      problems: string,
      latestCheckRef: string,
      checksRef: string,
      acceptanceKind: string,
      acceptancePassed: boolean,
      failedCriteria: string,
    }),
    evidence: object({
      record: string,
      request: string,
      input: string,
      context: string,
      trace: string,
      tools: string,
      report: string,
      acceptance: string,
      result: string,
    }),
    rsi: object({
      status: string,
      eligible: boolean,
      reason: string,
      checksRef: string,
      cycleId: string,
      directory: string,
      error: string,
    }),
  }),
};

export function projectWorkingMemory(record: RunRecord, directory: string) {
  const ref = (file: string) => `${directory}/${file}`;
  const m = record.monitoring;
  const latest = m?.checks.at(-1);
  return {
    version: 3,
    task: {
      runId: record.runId,
      assetId: record.assetId,
      mode: record.mode,
      status: record.status,
      request: record.request,
      objective: record.method.objective,
      scenario: record.method.scenario,
      inputSha256: record.input?.sha256 ?? "",
      error: record.error ?? "",
    },
    generation: {
      status: record.bundle
        ? record.mode === "generate"
          ? "generated"
          : "reused"
        : "pending",
      strategyId: record.generationStrategy?.id ?? "",
      summary: record.bundle?.summary ?? "",
      agentCount: record.bundle?.agents.length ?? 0,
      stepCount: record.bundle?.steps.length ?? 0,
      bundleRef: record.bundle ? ref("bundle.json") : "",
      contextRef: record.context ? ref("context.json") : "",
    },
    execution: {
      status:
        record.status === "running" && (record.execution || m?.activeStep)
          ? "running"
          : (record.execution?.status ?? "pending"),
      activeStep: m?.activeStep ?? "",
      attempt: m?.attempt ?? 0,
      completedSteps:
        record.execution?.steps.filter((s) => s.status === "passed").length ??
        0,
      totalSteps: record.bundle?.steps.length ?? 0,
      toolCalls: m?.toolCalls ?? 0,
      toolErrors: m?.toolErrors ?? 0,
      outputRef: m?.outputRef ?? "",
      stepsRef: record.execution ? ref("execution.json") : "",
    },
    metacognition: {
      checkpoint: m?.checkpoint ?? "pending",
      checkCount: m?.checks.length ?? 0,
      failedChecks: m?.checks.filter((c) => !c.review.passed).length ?? 0,
      revisions: m?.revisions ?? 0,
      coverage:
        latest?.review.coverage
          .map((c) => `${c.goal}: ${c.status}`)
          .join("\n") ?? "",
      progress: latest?.review.progress ?? "",
      problems:
        latest?.review.problems
          .map((p) => `${p.kind}: ${p.detail}`)
          .join("\n") ?? "",
      latestCheckRef: latest?.resultRef ?? "",
      checksRef: m ? ref("metacognition.json") : "",
      acceptanceKind: record.acceptance?.kind ?? "pending",
      acceptancePassed: record.acceptance?.passed ?? false,
      failedCriteria:
        record.acceptance?.checks
          .filter((c) => !c.passed)
          .map((c) => c.id)
          .join(", ") ?? "",
    },
    evidence: {
      record: ref("record.json"),
      request: record.request ? ref("request.json") : "",
      input: record.input ? ref("input.json") : "",
      context: record.context ? ref("context.json") : "",
      trace: ref("trace.jsonl"),
      tools: m?.toolCalls ? ref("tool-calls.jsonl") : "",
      report: m?.reportRef ?? "",
      acceptance: record.acceptance ? ref("acceptance.json") : "",
      result: record.finishedAt && record.execution ? ref("result.md") : "",
    },
    rsi: {
      status: record.rsi?.status ?? "pending",
      eligible: record.rsi?.eligible ?? false,
      reason: record.rsi?.reasons.join("\n") ?? "",
      checksRef: m ? ref("metacognition.json") : "",
      cycleId: record.rsi?.cycleId ?? "",
      directory: record.rsi?.directory ?? "",
      error: record.rsi?.error ?? "",
    },
  };
}
export type WorkingMemory = ReturnType<typeof projectWorkingMemory>;

export const memorySchema = {
  ...partitionSchema,
  properties: Object.fromEntries(
    Object.entries(partitionSchema.properties).map(([name, schema]) => [
      name,
      name === "version"
        ? schema
        : {
            $ref: "urn:brainary:wm:v1:map",
            "x-wm-map": { key_type: { type: "string" }, value_type: schema },
          },
    ]),
  ),
};
export type StoredWorkingMemory = { version: number } & {
  [K in Exclude<keyof WorkingMemory, "version">]: {
    entries: { key: string; value: WorkingMemory[K] }[];
  };
};
export function storeWorkingMemory(wm: WorkingMemory): StoredWorkingMemory {
  return Object.fromEntries(
    Object.entries(wm).map(([key, value]) => [
      key,
      key === "version" ? value : { entries: [{ key: "current", value }] },
    ]),
  ) as StoredWorkingMemory;
}
export function readWorkingMemory(stored: StoredWorkingMemory): WorkingMemory {
  return Object.fromEntries(
    Object.entries(stored).map(([key, value]) => [
      key,
      key === "version"
        ? value
        : (value as { entries: { value: unknown }[] }).entries[0].value,
    ]),
  ) as WorkingMemory;
}
