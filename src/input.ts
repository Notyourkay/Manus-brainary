import { ask } from "@brainary/poa-sdk";
import type { TaskRequest } from "./contracts.js";

export async function readTask(): Promise<TaskRequest> {
  const response = await ask({
    questions: [{ question: "请描述需要完成的任务、输入材料和期望输出。" }],
  });
  if (response.status === "unavailable") {
    throw new Error(
      "请在 Brainary TUI 中使用 /poa fg 运行 manus.poa。暂无命令行任务输入入口。",
    );
  }
  const description = response.answers[0]?.text?.trim();
  if (!description) {
    throw new Error("任务内容不能为空。请重新运行并输入任务。");
  }
  return { description };
}
