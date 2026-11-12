import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import domain from "../knowledge/order-audit.json";
import { parseBundle } from "../src/bundle.js";
import type { DomainKnowledge, ToolReceipt } from "../src/contracts.js";
import { expectedOrderReport, validateOrderRun } from "../src/validation.js";
import fixture from "./fixtures/bundle.json";

const knowledge = domain as DomainKnowledge;
const input = (name: string) => {
  const content = readFileSync(`examples/${name}.csv`, "utf8");
  return {
    source: name,
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
};
const a = input("orders-a"),
  b = input("orders-b");
const bundle = parseBundle(JSON.stringify(fixture), []);
bundle.steps[0].knowledgeRefs = domain.rules.map((rule) => rule.id);
const receipt = (
  operation: "read" | "write",
  result: Record<string, unknown>,
): ToolReceipt => ({
  operation,
  result,
  callId: operation,
  agentId: "task-agent",
  runId: "run",
  assetId: "asset",
  args: {},
  startedAt: "2026-11-12T00:00:00Z",
  finishedAt: "2026-11-12T00:00:01Z",
  status: "completed",
  error: null,
});

describe("objective task acceptance", () => {
  it("checks real fixture totals including cancellation, refunds and cents", () => {
    expect(expectedOrderReport(a, knowledge)).toMatchObject({
      rowCount: 4,
      includedCount: 3,
      cancelledCount: 1,
      grossCents: 17010,
      refundCents: 3010,
      netCents: 14000,
      byCustomer: [
        { customer: "客户乙", netCents: 0 },
        { customer: "客户甲", netCents: 14000 },
      ],
    });
    expect(expectedOrderReport(b, knowledge)).toMatchObject({
      rowCount: 5,
      includedCount: 4,
      cancelledCount: 1,
      grossCents: 2630,
      refundCents: 1044,
      netCents: 1586,
    });
    expect(expectedOrderReport(b, knowledge).byCustomer).toEqual(
      expect.arrayContaining([
        { customer: "客户,丙", netCents: 20 },
        { customer: "客户丁", netCents: 1000 },
        { customer: "客户戊", netCents: 566 },
      ]),
    );
  });
  it("requires correct results AND matching tool/knowledge evidence", () => {
    const report = expectedOrderReport(a, knowledge);
    const options = {
      input: a,
      domain: knowledge,
      report,
      reportHash: "report-sha",
      receipts: [
        receipt("read", { sourceSha256: a.sha256 }),
        receipt("write", { sha256: "report-sha" }),
      ],
      bundle,
      agentIds: ["task-agent"],
    };
    expect(validateOrderRun(options).passed).toBe(true);
    expect(
      validateOrderRun({
        ...options,
        report: { ...report, byCustomer: [...report.byCustomer].reverse() },
      }).passed,
    ).toBe(true);
    expect(
      validateOrderRun({ ...options, report: { ...report, netCents: 999 } })
        .passed,
    ).toBe(false);
    expect(validateOrderRun({ ...options, receipts: [] }).passed).toBe(false);
    expect(
      validateOrderRun({ ...options, agentIds: ["another-agent"] }).passed,
    ).toBe(false);
    expect(
      validateOrderRun({ ...options, reportHash: "changed-report" }).passed,
    ).toBe(false);
    const missing = structuredClone(bundle);
    missing.steps[0].knowledgeRefs = [];
    expect(validateOrderRun({ ...options, bundle: missing }).passed).toBe(
      false,
    );
    expect(
      validateOrderRun({ ...options, report: null }).checks[0].passed,
    ).toBe(false);
  });
});
