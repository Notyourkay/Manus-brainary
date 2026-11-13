import { describe, expect, it } from "vitest";
import {
  memorySchema,
  projectWorkingMemory,
  readWorkingMemory,
  storeWorkingMemory,
} from "../src/working-memory.js";
import { runRecord } from "./fixtures/run.js";

describe("partitioned working memory", () => {
  it("separates generation from execution, keeping full material and outputs in files", () => {
    const record = runRecord();
    record.input.content = "private material".repeat(1000);
    record.execution.finalOutput = "long output".repeat(1000);
    record.monitoring.activeStep = "answer";
    record.monitoring.attempt = 2;
    const wm = projectWorkingMemory(record, "/runs/run");
    expect(wm.generation).toMatchObject({
      agentCount: 2,
      stepCount: 2,
      bundleRef: "/runs/run/bundle.json",
    });
    expect(wm.execution).toMatchObject({
      activeStep: "answer",
      attempt: 2,
      stepsRef: "/runs/run/execution.json",
    });
    expect(wm.evidence.input).toBe("/runs/run/input.json");
    expect(wm.evidence.report).toBe("");
    expect(JSON.stringify(wm)).not.toContain("private material");
    expect(JSON.stringify(wm)).not.toContain("long output");
    const stored = storeWorkingMemory(wm);
    expect(stored.task.entries[0].value.runId).toBe(record.runId);
    expect(readWorkingMemory(stored)).toEqual(wm);
    expect(memorySchema.properties.task).toMatchObject({
      $ref: "urn:brainary:wm:v1:map",
    });
  });
});
