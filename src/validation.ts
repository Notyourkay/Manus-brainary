import Ajv from "ajv";
import { parseOrders } from "../resources/table-core.mjs";
import type {
  Acceptance,
  Check,
  DomainKnowledge,
  GeneratedBundle,
  RunInput,
  ToolReceipt,
} from "./contracts.js";

export interface OrderReport {
  rowCount: number;
  includedCount: number;
  cancelledCount: number;
  grossCents: number;
  refundCents: number;
  netCents: number;
  byCustomer: { customer: string; netCents: number }[];
  ruleRefs: string[];
  sourceSha256: string;
}
const numberFields = [
  "rowCount",
  "includedCount",
  "cancelledCount",
  "grossCents",
  "refundCents",
  "netCents",
];
const validReport = new Ajv({ logger: false }).compile<OrderReport>({
  type: "object",
  additionalProperties: false,
  required: [...numberFields, "byCustomer", "ruleRefs", "sourceSha256"],
  properties: {
    ...Object.fromEntries(
      numberFields.map((name) => [name, { type: "integer", minimum: 0 }]),
    ),
    byCustomer: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["customer", "netCents"],
        properties: {
          customer: { type: "string" },
          netCents: { type: "integer", minimum: 0 },
        },
      },
    },
    ruleRefs: { type: "array", uniqueItems: true, items: { type: "string" } },
    sourceSha256: { type: "string" },
  },
});
export function expectedOrderReport(
  input: RunInput,
  domain: DomainKnowledge,
): OrderReport {
  const rows = parseOrders(input.content);
  const included = rows.filter((row) => row.status !== "cancelled");
  const totals = new Map<string, number>();
  for (const row of included)
    totals.set(
      row.customer,
      (totals.get(row.customer) ?? 0) + row.amountCents - row.refundCents,
    );
  const grossCents = included.reduce((sum, row) => sum + row.amountCents, 0);
  const refundCents = included.reduce((sum, row) => sum + row.refundCents, 0);
  return {
    rowCount: rows.length,
    includedCount: included.length,
    cancelledCount: rows.length - included.length,
    grossCents,
    refundCents,
    netCents: grossCents - refundCents,
    byCustomer: [...totals]
      .map(([customer, netCents]) => ({ customer, netCents }))
      .sort(compareCustomer),
    ruleRefs: domain.rules.map((rule) => rule.id).sort(),
    sourceSha256: input.sha256,
  };
}
export function validateOrderRun(options: {
  input: RunInput;
  domain: DomainKnowledge;
  report: unknown;
  reportHash: string | null;
  receipts: ToolReceipt[];
  bundle: GeneratedBundle;
  agentIds: string[];
}): Acceptance {
  const { input, domain, report, reportHash, receipts, bundle, agentIds } =
    options;
  const expected = expectedOrderReport(input, domain);
  const shape = validReport(report);
  const checks: Check[] = [
    {
      id: "report-schema",
      passed: shape,
      expected: "订单报告契约",
      actual: shape ? "符合" : validReport.errors,
    },
  ];
  if (shape) {
    const normalized = {
      ...report,
      byCustomer: [...report.byCustomer].sort(compareCustomer),
      ruleRefs: [...report.ruleRefs].sort(),
    };
    for (const key of Object.keys(expected) as (keyof OrderReport)[])
      checks.push({
        id: `report.${key}`,
        passed:
          JSON.stringify(normalized[key]) === JSON.stringify(expected[key]),
        expected: expected[key],
        actual: normalized[key],
      });
  }
  const own = receipts.filter(
    (item) => agentIds.includes(item.agentId) && item.status === "completed",
  );
  const read = own.find(
    (item) =>
      item.operation === "read" && item.result?.sourceSha256 === input.sha256,
  );
  const write = [...own]
    .reverse()
    .find(
      (item) =>
        item.operation === "write" && item.result?.sha256 === reportHash,
    );
  const refs = new Set(bundle.steps.flatMap((step) => step.knowledgeRefs));
  checks.push(
    {
      id: "tool.read",
      passed: !!read,
      expected: "任务实例读取本次材料",
      actual: read?.callId ?? null,
    },
    {
      id: "tool.write",
      passed: !!write,
      expected: "任务实例写入当前报告",
      actual: write?.callId ?? null,
    },
    {
      id: "plan.knowledge",
      passed: domain.rules.every((rule) => refs.has(rule.id)),
      expected: domain.rules.map((rule) => rule.id),
      actual: [...refs],
    },
  );
  return {
    kind: "objective",
    passed: checks.every((check) => check.passed),
    checks,
  };
}

// 验收记录采用确定的字符串顺序，避免随系统语言改变。
function compareCustomer(
  a: { customer: string },
  b: { customer: string },
): number {
  return a.customer < b.customer ? -1 : a.customer > b.customer ? 1 : 0;
}
