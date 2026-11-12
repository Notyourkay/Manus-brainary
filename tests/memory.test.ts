import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { queryEpisodes, rebuildIndex } from "../resources/memory.mjs";

describe("episode index over existing records", () => {
  it("registers a run outside the memory root and retains it on subsequent queries", async () => {
    const root = await mkdtemp(join(tmpdir(), "manus-shared-memory-"));
    const external = await mkdtemp(join(tmpdir(), "manus-other-workspace-"));
    const source = join(external, "record.json");
    try {
      await writeFile(
        source,
        JSON.stringify({
          runId: "external",
          assetId: "asset",
          status: "completed",
          method: { objective: "订单 CSV 核对", scenario: "order-audit" },
        }),
      );
      await rebuildIndex(root, [source]);
      const hits = queryEpisodes(
        await rebuildIndex(root),
        "order-audit",
        "订单",
      );
      expect(hits).toHaveLength(1);
      expect(hits[0].source).toBe(source);
      await rm(source);
      expect(await rebuildIndex(root)).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });
  it("indexes legacy and new records, selects the scenario and preserves evidence paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "manus-memory-"));
    try {
      const records = [
        {
          runId: "old",
          assetId: "old-asset",
          task: { description: "订单 CSV 核对" },
          status: "completed",
          finishedAt: "2026-11-11T00:00:00Z",
          execution: { finalOutput: "旧运行结果" },
        },
        {
          runId: "new",
          assetId: "new-asset",
          method: { objective: "订单 CSV 核对", scenario: "order-audit" },
          status: "failed",
          finishedAt: "2026-11-12T00:00:00Z",
          acceptance: {
            passed: false,
            checks: [{ id: "report.netCents", passed: false }],
          },
        },
        {
          runId: "text",
          assetId: "text-asset",
          method: { objective: "会议纪要", scenario: "text" },
          status: "completed",
        },
        { runId: "active", status: "running" },
      ];
      for (const record of records) {
        const dir = join(root, "runs", record.runId);
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "record.json"), JSON.stringify(record));
      }
      const index = await rebuildIndex(root);
      expect(index).toHaveLength(3);
      const hits = queryEpisodes(index, "order-audit", "订单 CSV");
      expect(hits.map((item: { runId: string }) => item.runId)).toEqual([
        "new",
        "old",
      ]);
      expect(hits[0].summary).toContain("report.netCents=false");
      expect(hits[1].source).toBe(join(root, "runs/old/record.json"));
      expect(
        JSON.parse(await readFile(join(root, "episodes/index.json"), "utf8"))
          .episodes,
      ).toHaveLength(3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
