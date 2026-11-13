import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseBundle } from "../src/bundle.js";
import { config } from "../src/config.js";
import type { ExecutionInput, TaskAsset } from "../src/contracts.js";
import { executeBundle } from "../src/execution.js";
import { generateBundle } from "../src/generator.js";
import { askForTask } from "../src/input.js";
import { RunJournal } from "../src/records.js";
import {
  projectWorkingMemory,
  storeWorkingMemory,
} from "../src/working-memory.js";
import fixture from "./fixtures/bundle.json";

const shell = promisify(execFile);
const method = {
  objective: "整理要求",
  scenario: "text" as const,
  inputKind: "text" as const,
};
const context = {
  domain: null,
  experiences: [],
  episodes: [],
  selection: "text",
};
const task: ExecutionInput = {
  request: "整理要求 A、B",
  method,
  context,
  material: { kind: "text", value: "A、B" },
};
let root: string;
let stored: string | null = null;
let registrations = 0;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "manus-state-"));
  // 仅替换 Brainary 宿主传输；使用真实 SDK、RunJournal 及其生成的文件脚本。
  vi.stubGlobal("tools", {
    exec_command: async ({ cmd }: { cmd: string }) => {
      const result = await shell("/bin/sh", ["-c", cmd], {
        cwd: root,
        env: { ...process.env, MANUS_MEMORY_ROOT: root },
      });
      return { exit_code: 0, output: result.stdout };
    },
    wm__register_schema: async ({
      kind,
      schema,
    }: {
      kind: string;
      schema: string;
    }) => {
      registrations++;
      return {
        kind,
        accepted: true,
        accepted_bytes: Buffer.byteLength(schema),
      };
    },
    wm__load_data: async ({ kind, data }: { kind: string; data: string }) => {
      const replaced_previous = stored !== null;
      stored = data;
      return {
        kind,
        accepted: true,
        accepted_bytes: Buffer.byteLength(data),
        replaced_previous,
      };
    },
    wm__read_data: async ({ kind }: { kind: string }) => ({
      kind,
      data: stored,
    }),
    wm__delete_data: async ({ kind }: { kind: string }) => {
      stored = null;
      return { kind, deleted: true };
    },
  });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await rm(root, { recursive: true, force: true });
});

async function open(
  mode: "generate" | "replay" | "evaluate" = "generate",
  asset?: TaskAsset,
) {
  return RunJournal.open(
    method,
    { ...config, artifactRoot: join(root, "artifacts") },
    mode,
    asset,
  );
}
async function assertSnapshot(journal: RunJournal) {
  const record = JSON.parse(
    await readFile(`${journal.paths.runDirectory}/record.json`, "utf8"),
  );
  expect(record).toEqual(journal.record);
  expect(
    JSON.parse(
      await readFile(`${journal.paths.runDirectory}/wm-snapshot.json`, "utf8"),
    ),
  ).toEqual(
    storeWorkingMemory(
      projectWorkingMemory(record, journal.paths.runDirectory),
    ),
  );
}

describe("real journal and SDK state lifecycle", () => {
  it("persists generation before model calls and the pending question before ask, then clears it", async () => {
    const journal = await open();
    await journal.setRequest(task.request);
    expect((await journal.readWorkingMemory()).generation.status).toBe(
      "understanding",
    );
    let calls = 0;
    const generate = () =>
      generateBundle(
        journal.record.request,
        context,
        config,
        async () => {
          calls++;
          expect((await journal.readWorkingMemory()).generation).toMatchObject({
            status: "generating",
            pendingQuestion: "",
          });
          return {
            agentId: `generator-${calls}`,
            text: JSON.stringify(
              calls === 1
                ? { status: "clarify", question: "需要整理哪些内容？" }
                : { status: "ready", method, material: null, bundle: fixture },
            ),
          };
        },
        undefined,
        (status, question) => journal.observeGeneration(status, question),
      );
    const first = await generate();
    expect(first.status).toBe("clarify");
    vi.stubGlobal("ask", async () => {
      expect((await journal.readWorkingMemory()).generation).toMatchObject({
        status: "awaiting_input",
        pendingQuestion: "需要整理哪些内容？",
      });
      await assertSnapshot(journal);
      return { status: "answered", answers: [{ text: "整理 A、B" }] };
    });
    const answer = await askForTask("需要整理哪些内容？");
    await journal.setRequest(`${task.request}\n补充回答：${answer}`);
    expect((await journal.readWorkingMemory()).generation).toMatchObject({
      status: "understanding",
      pendingQuestion: "",
    });
    const result = await generate();
    if (result.status !== "ready") throw new Error("expected ready");
    await journal.completeGeneration(result.method, result.bundle);
    expect((await journal.readWorkingMemory()).generation).toMatchObject({
      status: "generated",
      pendingQuestion: "",
      stepCount: 2,
    });
    expect(calls).toBe(2);
    await assertSnapshot(journal);
  }, 20000);

  it("updates steps and attempt numbers before execution, including retry and terminal cleanup", async () => {
    const journal = await open();
    const bundle = parseBundle(JSON.stringify(fixture), []);
    await journal.completeGeneration(method, bundle);
    const observed: unknown[] = [];
    const result = await executeBundle(
      task,
      bundle,
      async () => {
        const wm = await journal.readWorkingMemory();
        observed.push({
          status: wm.execution.status,
          step: wm.execution.activeStep,
          attempt: wm.execution.attempt,
          output: wm.execution.outputRef,
        });
        await assertSnapshot(journal);
        return { agentId: `task-${observed.length}`, text: "output" };
      },
      async (step, attempt) => {
        const wm = await journal.readWorkingMemory();
        expect(wm.execution).toMatchObject({
          status: "checking",
          activeStep: step.id,
          attempt,
        });
        journal.record.monitoring.outputRef = "previous-output";
        return {
          reviewerId: "reviewer",
          review: {
            passed: step.id !== "extract" || attempt === 2,
            feedback: "补充 B",
          },
        };
      },
      async (step) => {
        journal.record.execution ??= {
          status: "failed",
          steps: [],
          finalOutput: null,
        };
        journal.record.execution.steps.push(step);
        await journal.observeExecution({ type: "step_completed", step });
        expect((await journal.readWorkingMemory()).execution).toMatchObject({
          status: "between_steps",
          activeStep: "",
          attempt: 0,
          outputRef: "",
        });
      },
      (event) => journal.observeExecution(event),
    );
    const events = (
      await readFile(`${journal.paths.runDirectory}/trace.jsonl`, "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(
      events
        .filter(
          (e) => e.type === "wm_state_updated" && e.cause === "step_started",
        )
        .map((e) => ({
          step: e.execution.activeStep,
          attempt: e.execution.attempt,
        })),
    ).toEqual([
      { step: "extract", attempt: 0 },
      { step: "answer", attempt: 0 },
    ]);
    expect(observed).toEqual([
      { status: "running", step: "extract", attempt: 1, output: "" },
      { status: "running", step: "extract", attempt: 2, output: "" },
      { status: "running", step: "answer", attempt: 1, output: "" },
    ]);
    journal.record.execution = result;
    journal.record.status = "completed";
    await journal.observeExecution({ type: "run_finished" });
    expect((await journal.readWorkingMemory()).execution).toMatchObject({
      status: "completed",
      activeStep: "",
      attempt: 0,
      completedSteps: 2,
    });
    await assertSnapshot(journal);
  }, 20000);

  it("clears a failed step and keeps generated/reused states when execution fails", async () => {
    const journal = await open();
    const bundle = parseBundle(JSON.stringify(fixture), []);
    bundle.steps = [{ ...bundle.steps[0], maxRevisions: 0 }];
    await journal.completeGeneration(method, bundle);
    journal.record.execution = await executeBundle(
      task,
      bundle,
      async () => ({ agentId: "bad", text: "incomplete" }),
      async () => ({
        reviewerId: "reviewer",
        review: { passed: false, feedback: "缺 B" },
      }),
      (step) => journal.observeExecution({ type: "step_completed", step }),
      (event) => journal.observeExecution(event),
    );
    journal.record.status = "failed";
    await journal.observeExecution({ type: "run_finished" });
    expect((await journal.readWorkingMemory()).execution).toMatchObject({
      status: "failed",
      activeStep: "",
      attempt: 0,
    });
    await assertSnapshot(journal);
    const asset = {
      assetId: "existing",
      bundle,
      generatorVersion: "v2",
      generationStrategy: undefined,
    } as TaskAsset;
    for (const mode of ["replay", "evaluate"] as const) {
      const reused = await open(mode, asset);
      await reused.setRequest(task.request);
      await reused.observeExecution({
        type: "attempt_started",
        stepId: bundle.steps[0].id,
        attempt: 1,
      });
      await reused.fail(new Error("task failed"));
      const wm = await reused.readWorkingMemory();
      expect(wm.generation.status).toBe("reused");
      expect(wm.execution).toMatchObject({
        status: "error",
        activeStep: "",
        attempt: 0,
      });
      await assertSnapshot(reused);
    }
    await journal.fail(new Error("execution failed"));
    expect((await journal.readWorkingMemory()).generation.status).toBe(
      "generated",
    );
    const failed = await open();
    await failed.observeGeneration("awaiting_input", "missing input");
    await failed.fail(new Error("ask unavailable"));
    expect((await failed.readWorkingMemory()).generation).toMatchObject({
      status: "failed",
      pendingQuestion: "",
    });
    await assertSnapshot(failed);
    expect(registrations).toBe(1);
  }, 20000);
});
