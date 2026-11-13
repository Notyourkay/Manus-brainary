import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import domain from "../knowledge/order-audit.json";
import { readEvaluation } from "../resources/evaluation.mjs";
import { parseBundle } from "../src/bundle.js";
import { config } from "../src/config.js";
import { measureEvaluation } from "../src/rsi/measurement.js";
import fixture from "./fixtures/bundle.json";

describe("RSI metrics from files and real tools", () => {
  it("recomputes objective checks, uses trace calls, and rejects altered reports", async () => {
    const directory = await mkdtemp(join(tmpdir(), "manus-evaluation-"));
    try {
      await mkdir(join(directory, "resources"));
      for (const name of ["table-core.mjs", "order-tools.mjs"])
        await cp(`resources/${name}`, join(directory, "resources", name));
      const call = join(directory, "call.json");
      await writeFile(
        call,
        JSON.stringify({
          agentId: "task",
          runId: "run",
          assetId: "asset",
          inputPath: join(directory, "input.csv"),
          sourceRoot: resolve("."),
          reportPath: join(directory, "report.json"),
          receiptsPath: join(directory, "tool-calls.jsonl"),
        }),
      );
      const read = JSON.parse(
        execFileSync(
          process.execPath,
          ["resources/order-tools.mjs", "read", call, "examples/orders-c.csv"],
          { encoding: "utf8" },
        ),
      );
      const input = JSON.parse(
        await readFile(join(directory, "input.json"), "utf8"),
      );
      const report = {
        rowCount: 6,
        includedCount: 5,
        cancelledCount: 1,
        grossCents: 13409,
        refundCents: 319,
        netCents: 13090,
        byCustomer: [
          { customer: '客户"己', netCents: 3000 },
          { customer: "客户辛", netCents: 90 },
          { customer: "客户壬", netCents: 10000 },
        ],
        ruleRefs: domain.rules.map((rule) => rule.id),
        sourceSha256: read.result.sourceSha256,
      };
      execFileSync(process.execPath, [
        "resources/order-tools.mjs",
        "write",
        call,
        JSON.stringify(report),
      ]);
      const bundle = parseBundle(JSON.stringify(fixture), []);
      bundle.steps[0].knowledgeRefs = domain.rules.map((rule) => rule.id);
      await writeFile(
        join(directory, "record.json"),
        JSON.stringify({
          runId: "run",
          assetId: "asset",
          status: "completed",
          config,
          input,
          request: "核对订单",
          context: { domain, experiences: [], episodes: [] },
          bundle,
          startedAt: "2026-11-13T00:00:00Z",
          finishedAt: "2026-11-13T00:00:05Z",
          conditions: {
            model: config.model,
            node: process.version,
            platform: process.platform,
            arch: process.arch,
            sdkVersion: "0.2.0-rc",
            requiredBrainary: "0.2.0-rc",
          },
          executorVersion: "v1.5",
          generatorVersion: "v2",
          evaluation: { caseId: "c" },
          execution: {
            status: "completed",
            steps: [{ attempts: [{ agentId: "task" }] }],
          },
          acceptance: { passed: true },
          error: null,
        }),
      );
      await writeFile(
        join(directory, "trace.jsonl"),
        [
          {
            type: "agent_requested",
            definition: { id: "task", systemPrompt: "large".repeat(30000) },
          },
          { type: "agent_requested" },
          { type: "irrelevant" },
        ]
          .map((event) => JSON.stringify(event))
          .join("\n"),
      );
      const evidence = await readEvaluation(directory);
      expect(JSON.stringify(evidence.trace).length).toBeLessThan(500);
      expect(measureEvaluation(evidence, directory)).toMatchObject({
        passed: true,
        checksPassed: 13,
        checksTotal: 13,
        agentCalls: 2,
        toolCalls: 2,
        elapsedMs: 5000,
      });
      await writeFile(
        join(directory, "report.json"),
        JSON.stringify({ ...report, netCents: 1 }),
      );
      const changed = measureEvaluation(
        await readEvaluation(directory),
        directory,
      );
      expect(changed.passed).toBe(false);
      expect(changed.checksPassed).toBeLessThan(13);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
