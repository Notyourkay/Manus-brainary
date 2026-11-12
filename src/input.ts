import { ask, POA_INPUT } from "@brainary/poa-sdk";
import type { RunInput, TaskMethod } from "./contracts.js";
import { runNode } from "./files.js";

export type PackageRequest =
  | { mode: "new"; request: string }
  | { mode: "replay" };

export async function readRequest(): Promise<string> {
  const supplied = await launchInput();
  return supplied === null
    ? askForTask(
        "请描述你希望完成的任务。已有资料、约束或文件位置可以直接写在这段描述里。",
      )
    : parseUserRequest(supplied);
}

export async function readPackageInput(): Promise<PackageRequest> {
  return parsePackageRequest(await launchInput());
}

export function parsePackageRequest(value: unknown): PackageRequest {
  if (value == null) return { mode: "replay" };
  const request = parseUserRequest(value);
  return /^(重跑原任务|重跑原材料)[。！!]?$/u.test(request)
    ? { mode: "replay" }
    : { mode: "new", request };
}

export async function askForTask(question: string): Promise<string> {
  const response = await ask({ questions: [{ question }] });
  if (response.status === "unavailable")
    throw new Error(
      "请在 Brainary TUI 前台运行，或通过 MANUS_INPUT_FILE 提供任务描述。",
    );
  return parseUserRequest(response.answers[0]?.text);
}

export function parseUserRequest(value: unknown): string {
  const request =
    typeof value === "object" && value !== null && "request" in value
      ? value.request
      : value;
  if (typeof request !== "string" || !request.trim())
    throw new Error("请输入完整的任务描述。");
  return request.trim();
}

// 这里只做候选资料检索；最终任务类型由外层 Manus 生成结果决定。
export function contextHint(request: string): TaskMethod {
  const order = /订单|结算|order|csv/iu.test(request);
  return {
    objective: request,
    scenario: order ? "order-audit" : "text",
    inputKind: order ? "csv" : "text",
  };
}

export async function captureInput(
  kind: TaskMethod["inputKind"],
  material: string,
): Promise<RunInput> {
  const result = JSON.parse(await runNode(inputCaptureScript(kind, material)));
  if (result.error) throw new Error(result.error);
  return result.input;
}

export function inputCaptureScript(
  kind: TaskMethod["inputKind"],
  material: string,
): string {
  return `
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
const csv = ${JSON.stringify(kind === "csv")};
const material = ${JSON.stringify(material)};
const source = csv ? resolve(material) : "user:text";
try {
  const content = csv ? await readFile(source, "utf8") : material;
  console.log(JSON.stringify({input:{source,content,sha256:createHash("sha256").update(content).digest("hex")}}));
} catch (error) {
  const reason = error.code === "ENOENT" ? "文件不存在" : error.message;
  console.log(JSON.stringify({error:"无法读取任务资料："+source+"（"+reason+"）。请在任务描述中提供正确的文件位置。"}));
}
`;
}

async function launchInput(): Promise<unknown | null> {
  // TUI 在未传业务参数时安装空对象，视为没有显式输入。
  if (
    POA_INPUT != null &&
    !(
      typeof POA_INPUT === "object" &&
      !Array.isArray(POA_INPUT) &&
      Object.keys(POA_INPUT).length === 0
    )
  )
    return POA_INPUT;
  return JSON.parse(
    await runNode(`
import {readFile} from "node:fs/promises";
const path=process.env.MANUS_INPUT_FILE;
console.log(path ? await readFile(path,"utf8") : "null");
`),
  );
}
