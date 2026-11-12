import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  inputCaptureScript,
  parseNewTaskAnswer,
  parsePackageRequest,
  parseUserRequest,
} from "../src/input.js";

const capture = (kind: "text" | "csv", value: string) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", inputCaptureScript(kind, value)],
      { encoding: "utf8" },
    ),
  );

describe("natural-language task entry", () => {
  it("ends an unanswered or cancelled new-task prompt without replaying", () => {
    expect(
      parseNewTaskAnswer({ status: "unavailable", reason: "nonInteractive" }),
    ).toBeNull();
    expect(parseNewTaskAnswer({ status: "answered", answers: [] })).toBeNull();
    for (const text of [null, " ", "取消", "cancel"]) {
      expect(
        parseNewTaskAnswer({
          status: "answered",
          answers: [{ selected: null, text }],
        }),
      ).toBeNull();
    }
    expect(
      parseNewTaskAnswer({
        status: "answered",
        answers: [{ selected: null, text: "核对订单", rejected: true }],
      }),
    ).toBeNull();
    const request = "核对当前目录的 orders-b.csv";
    expect(
      parseNewTaskAnswer({
        status: "answered",
        answers: [{ selected: null, text: request }],
      }),
    ).toEqual({ mode: "new", request });
  });
  it("replays by default and changes tasks only with an explicit request", () => {
    expect(parsePackageRequest(null)).toEqual({ mode: "replay" });
    expect(parsePackageRequest("重跑原任务")).toEqual({ mode: "replay" });
    const request = "核对 orders-b.csv 并输出客户净额";
    expect(parsePackageRequest(request)).toEqual({ mode: "new", request });
    expect(parsePackageRequest({ request })).toEqual({ mode: "new", request });
    expect(() => parsePackageRequest({ request: " " })).toThrow("任务描述");
  });
  it("accepts a complete request without material fields or a file", () => {
    const request = "介绍三个适合初学者的时间管理方法";
    expect(parseUserRequest(request)).toBe(request);
    expect(parseUserRequest({ request })).toBe(request);
    expect(capture("text", request).input).toMatchObject({
      source: "user:text",
      content: request,
    });
    const text = "材料输入：`这不是路径`。";
    expect(capture("text", text).input.content).toBe(text);
  });
  it("reads the actual file identified by the model and hashes its content", () => {
    const content = readFileSync("examples/orders-a.csv", "utf8");
    expect(capture("csv", "examples/orders-a.csv").input).toEqual({
      source: resolve("examples/orders-a.csv"),
      content,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  });
  it("returns a useful file error instead of a failed shell script", () => {
    const result = capture("csv", "examples/does-not-exist.csv");
    expect(result.error).toContain("文件不存在");
    expect(result.error).toContain(resolve("examples/does-not-exist.csv"));
    expect(result.input).toBeUndefined();
    expect(() => parseUserRequest(" ")).toThrow("任务描述");
  });
});
