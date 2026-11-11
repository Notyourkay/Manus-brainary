import { describe, expect, it } from "vitest";
import { parseBundle } from "../src/bundle.js";
import type {
  AgentDefinition,
  AgentRunner,
  StepRecord,
} from "../src/contracts.js";
import { executeBundle } from "../src/execution.js";
import fixture from "./fixtures/bundle.json";

const task = { description: "根据我给出的要求生成答案" };
const passed = JSON.stringify({ passed: true, feedback: "满足要求" });
const failed = JSON.stringify({ passed: false, feedback: "补充要求 B" });

function scriptedRunner(replies: string[]) {
  const calls: { definition: AgentDefinition; message: string }[] = [];
  const run: AgentRunner = async (definition, message) => {
    calls.push({ definition, message });
    const reply = replies[calls.length - 1];
    if (reply === undefined) throw new Error("发生了预期外的 Agent 调用");
    return { agentId: `instance-${calls.length}`, text: reply };
  };
  return { run, calls };
}

describe("generated plan execution", () => {
  it("uses generated roles and passes upstream results into the next step", async () => {
    const bundle = parseBundle(JSON.stringify(fixture), []);
    const agent = scriptedRunner(["要求 A、B", passed, "最终答案", passed]);
    const progress: StepRecord[] = [];
    const result = await executeBundle(task, bundle, agent.run, (step) => {
      progress.push(step);
    });
    expect(result.status).toBe("completed");
    expect(result.finalOutput).toBe("最终答案");
    expect(agent.calls[0].definition).toEqual(bundle.agents[0]);
    expect(agent.calls[2].definition).toEqual(bundle.agents[1]);
    expect(JSON.parse(agent.calls[2].message).inputs).toEqual([
      { stepId: "extract", output: "要求 A、B" },
    ]);
    expect(progress.map((step) => step.stepId)).toEqual(["extract", "answer"]);
  });

  it("follows a changed generated plan without changing the executor", async () => {
    const changed = structuredClone(fixture);
    changed.steps = [changed.steps[1]];
    changed.steps[0].inputFrom = [];
    const agent = scriptedRunner(["直接形成答案", passed]);
    const result = await executeBundle(
      task,
      parseBundle(JSON.stringify(changed), []),
      agent.run,
      () => {},
    );
    expect(agent.calls.map((call) => call.definition.id)).toEqual([
      "writer",
      "manus-reviewer",
    ]);
    expect(result.steps).toHaveLength(1);
    expect(result.finalOutput).toBe("直接形成答案");
  });

  it("uses review feedback for one revision and forwards the corrected output", async () => {
    const agent = scriptedRunner([
      "仅要求 A",
      failed,
      "要求 A、B",
      passed,
      "最终答案",
      passed,
    ]);
    const result = await executeBundle(
      task,
      parseBundle(JSON.stringify(fixture), []),
      agent.run,
      () => {},
    );
    expect(result.status).toBe("completed");
    expect(result.steps[0].attempts).toHaveLength(2);
    expect(JSON.parse(agent.calls[2].message)).toMatchObject({
      previousOutput: "仅要求 A",
      feedback: "补充要求 B",
    });
    expect(JSON.parse(agent.calls[4].message).inputs[0].output).toBe(
      "要求 A、B",
    );
  });

  it("stops after a failed revision without executing dependent work", async () => {
    const agent = scriptedRunner(["仅要求 A", failed, "仍仅要求 A", failed]);
    const result = await executeBundle(
      task,
      parseBundle(JSON.stringify(fixture), []),
      agent.run,
      () => {},
    );
    expect(result.status).toBe("failed");
    expect(result.finalOutput).toBeNull();
    expect(result.steps).toHaveLength(1);
    expect(agent.calls).toHaveLength(4);
  });

  it("honors a generated decision to stop without revision", async () => {
    const agent = scriptedRunner(["要求 A、B", passed, "不完整答案", failed]);
    const result = await executeBundle(
      task,
      parseBundle(JSON.stringify(fixture), []),
      agent.run,
      () => {},
    );
    expect(result.steps[1].attempts).toHaveLength(1);
    expect(result.status).toBe("failed");
    expect(agent.calls).toHaveLength(4);
  });
});
