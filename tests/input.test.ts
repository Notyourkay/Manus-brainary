import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  inputCaptureScript,
  parseLaunch,
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

describe("unified Manus launch", () => {
  it("preserves natural-language inputs and dispatches explicit RSI input", () => {
    expect(parseLaunch("写一份会议提纲")).toEqual({
      action: "generate",
      request: "写一份会议提纲",
    });
    expect(parseLaunch({ request: "核对订单" })).toEqual({
      action: "generate",
      request: "核对订单",
    });
    expect(parseLaunch({ action: "generate", request: "核对订单" })).toEqual({
      action: "generate",
      request: "核对订单",
    });
    expect(
      parseLaunch({ action: "rsi", sourceDirectory: " /runs/source " }),
    ).toEqual({ action: "rsi", sourceDirectory: "/runs/source" });
  });
  it("rejects an unsupported action or missing operation input at entry", () => {
    expect(() => parseLaunch({ action: "other", request: "任务" })).toThrow(
      "action",
    );
    expect(() => parseLaunch({ action: "rsi" })).toThrow("来源运行目录");
    expect(() => parseLaunch({ action: "rsi", sourceDirectory: " " })).toThrow(
      "来源运行目录",
    );
    expect(() => parseLaunch({ action: "generate" })).toThrow("任务描述");
  });
});
