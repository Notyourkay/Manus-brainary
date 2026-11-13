import domain from "../../knowledge/order-audit.json";
import { parseBundle } from "../../src/bundle.js";
import { config } from "../../src/config.js";
import type {
  Acceptance,
  ExecutionResult,
  RunInput,
  RunRecord,
} from "../../src/contracts.js";
import { emptyMonitoring, type Monitoring } from "../../src/monitoring.js";
import bundle from "./bundle.json";

export function runRecord(): RunRecord & {
  monitoring: Monitoring;
  input: RunInput;
  execution: ExecutionResult;
  acceptance: Acceptance;
} {
  return {
    version: 2,
    runId: "run",
    assetId: "asset",
    mode: "generate",
    status: "completed",
    startedAt: "2026-11-13T00:00:00Z",
    finishedAt: "2026-11-13T00:00:10Z",
    config,
    method: {
      objective: "核对订单",
      scenario: "order-audit",
      inputKind: "csv",
    },
    request: "核对订单 /orders.csv",
    input: { source: "/orders.csv", content: "csv", sha256: "hash" },
    context: {
      domain: { ...domain, scenario: "order-audit" },
      experiences: [],
      episodes: [],
      selection: "orders",
    },
    bundle: parseBundle(JSON.stringify(bundle), []),
    execution: { status: "completed", steps: [], finalOutput: "完成" },
    acceptance: { kind: "objective", passed: true, checks: [] },
    error: null,
    conditions: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: "/tmp",
      model: config.model,
      sdkVersion: "0.2.0-rc",
      requiredBrainary: "0.2.0-rc",
      tools: [],
    },
    generatorVersion: "v2",
    executorVersion: "v2.1",
    monitoring: emptyMonitoring(),
  };
}
