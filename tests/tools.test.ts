import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOrders } from "../resources/table-core.mjs";

describe("real packaged task tools", () => {
  it("reads CSV and writes JSON through actual Node processes with receipts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "manus-tools-"));
    try {
      const context = {
        agentId: "real-caller-id",
        runId: "run",
        assetId: "asset",
        inputPath: join(dir, "input.csv"),
        sourceRoot: resolve("."),
        reportPath: join(dir, "report.json"),
        receiptsPath: join(dir, "tool-calls.jsonl"),
      };
      const path = join(dir, "call.json");
      await writeFile(path, JSON.stringify(context));
      const read = JSON.parse(
        execFileSync(
          process.execPath,
          ["resources/order-tools.mjs", "read", path, "examples/orders-b.csv"],
          { encoding: "utf8" },
        ),
      );
      expect(read.result.rows).toHaveLength(5);
      const snapshot = JSON.parse(
        await readFile(join(dir, "input.json"), "utf8"),
      );
      expect(snapshot.source).toBe(resolve("examples/orders-b.csv"));
      expect(await readFile(context.inputPath, "utf8")).toBe(snapshot.content);
      const replay = JSON.parse(
        execFileSync(
          process.execPath,
          ["resources/order-tools.mjs", "read", path],
          { encoding: "utf8" },
        ),
      );
      expect(replay.result).toEqual(read.result);
      expect(read.result.rows[0]).toMatchObject({
        customer: "客户,丙",
        amountCents: 30,
        refundCents: 10,
      });
      const report = { answer: "带引号、换行\n和 $(shell) 的内容" };
      execFileSync(process.execPath, [
        "resources/order-tools.mjs",
        "write",
        path,
        JSON.stringify(report),
      ]);
      expect(JSON.parse(await readFile(context.reportPath, "utf8"))).toEqual(
        report,
      );
      const receipts = (await readFile(context.receiptsPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(receipts.map((item) => item.operation)).toEqual([
        "read",
        "read",
        "write",
      ]);
      expect(
        receipts.every(
          (item) =>
            item.agentId === "real-caller-id" && item.status === "completed",
        ),
      ).toBe(true);
      const bad = spawnSync(
        process.execPath,
        ["resources/order-tools.mjs", "write", path, "invalid-json"],
        { encoding: "utf8" },
      );
      expect(bad.status).toBe(1);
      expect(JSON.parse(bad.stdout).status).toBe("error");
      expect(
        (await readFile(context.receiptsPath, "utf8")).trim().split("\n"),
      ).toHaveLength(4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("rejects real malformed input instead of calculating a plausible result", () => {
    expect(() =>
      parseOrders(
        "order_id,customer,status,amount,refund\nx,A,paid,2.00,3.00\n",
      ),
    ).toThrow("退款");
    expect(() =>
      parseOrders("order_id,customer,status,amount,refund\nx,A,unknown,2,0\n"),
    ).toThrow("状态");
    expect(() =>
      parseOrders("order_id,customer,status,amount,refund\nx,A,paid,0.001,0\n"),
    ).toThrow("两位");
  });
});
