import { describe, expect, it, vi } from "vitest";
import type { CognitiveCheck } from "../src/monitoring.js";
import type { RunJournal } from "../src/records.js";
import { runAutomaticRsi } from "../src/rsi/automatic.js";
import { decideRsi } from "../src/rsi/trigger.js";
import { runRecord } from "./fixtures/run.js";

vi.mock("@brainary/poa-sdk", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  notify: () => {},
}));
const check: CognitiveCheck = {
  id: "check-2",
  checkpoint: "step_completed",
  stepId: "extract",
  attempt: 1,
  reviewerId: "reviewer",
  wmRef: "/wm",
  evidenceRef: "/evidence",
  resultRef: "/check-2.json",
  review: {
    passed: false,
    feedback: "补 B",
    coverage: [{ goal: "B", status: "missing", evidenceRefs: ["/output"] }],
    progress: "缺 B",
    problems: [{ kind: "gap", detail: "缺 B", evidenceRefs: ["/output"] }],
  },
};
describe("evidence-based RSI trigger", () => {
  it("skips a successful task without signals and triggers after corrected failure", () => {
    const record = runRecord();
    expect(decideRsi(record)).toMatchObject({
      status: "skipped",
      eligible: false,
    });
    record.monitoring.checks.push(check);
    record.monitoring.revisions = 1;
    expect(decideRsi(record)).toMatchObject({
      status: "pending",
      eligible: true,
      sourceChecks: ["/check-2.json"],
    });
  });
  it("triggers redundancy or objective failure, not every multi-step plan", () => {
    const record = runRecord();
    record.monitoring.checks.push({
      ...check,
      review: {
        ...check.review,
        passed: true,
        problems: [
          {
            kind: "redundancy",
            detail: "规则重复",
            evidenceRefs: ["/bundle.json"],
          },
        ],
      },
    });
    expect(decideRsi(record).status).toBe("pending");
    record.monitoring.checks = [];
    record.acceptance.passed = false;
    expect(decideRsi(record).reasons).toContain("最终客观验收未通过");
  });
  it("keeps text, running, replay and evaluation runs out of automatic cycles", () => {
    const record = runRecord();
    record.monitoring.checks.push(check);
    record.mode = "replay";
    expect(decideRsi(record).status).toBe("recommended");
    record.mode = "generate";
    record.evaluation = {
      cycleId: "cycle",
      target: "outer",
      arm: "baseline",
      caseId: "b",
    };
    expect(decideRsi(record)).toMatchObject({
      status: "skipped",
      eligible: false,
      reasons: ["评估运行不递归触发 RSI"],
    });
    delete record.evaluation;
    record.method.scenario = "text";
    expect(decideRsi(record).eligible).toBe(false);
    record.method.scenario = "order-audit";
    record.status = "running";
    expect(decideRsi(record).eligible).toBe(false);
  });
  it("runs one cycle, saves its link and restores the source after evaluation", async () => {
    const record = runRecord();
    record.monitoring.checks.push(check);
    record.rsi = decideRsi(record);
    const saved: string[] = [];
    const journal = {
      record,
      paths: { runDirectory: "/runs/source" },
      save: async () => {
        saved.push(record.rsi?.status ?? "pending");
      },
      trace: async () => {},
    } as unknown as RunJournal;
    let calls = 0;
    const cycle = async (
      source: string,
      onStart: (c: { cycleId: string; directory: string }) => Promise<void>,
    ) => {
      calls++;
      expect(source).toBe("/runs/source");
      await onStart({ cycleId: "cycle", directory: "/rsi/cycle" });
    };
    await runAutomaticRsi(journal, cycle);
    await runAutomaticRsi(journal, cycle);
    expect(calls).toBe(1);
    expect(saved.at(-1)).toBe("completed");
    expect(record.rsi).toMatchObject({
      status: "completed",
      cycleId: "cycle",
      directory: "/rsi/cycle",
    });
    expect(record.status).toBe("completed");
  });
  it("records cycle failure without changing the finished task", async () => {
    const record = runRecord();
    record.monitoring.checks.push(check);
    record.rsi = decideRsi(record);
    const journal = {
      record,
      paths: { runDirectory: "/runs/source" },
      save: async () => {},
      trace: async () => {},
    } as unknown as RunJournal;
    await runAutomaticRsi(journal, async () => {
      throw new Error("model unavailable");
    });
    expect(record.rsi).toMatchObject({
      status: "error",
      error: "Error: model unavailable",
    });
    expect(record.status).toBe("completed");
  });
});
