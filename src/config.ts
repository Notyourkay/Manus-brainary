import { BrainaryTool } from "@brainary/poa-sdk";
import type { ManusConfig } from "./contracts.js";
export const config: ManusConfig = {
  model: { model_id: "gpt-5.6-sol", provider: "custom" },
  availableTools: [BrainaryTool.exec_command, BrainaryTool.view_image],
  agentTimeoutMs: 240_000,
  artifactRoot: "artifacts/manus",
};
export const toolCatalog = {
  exec_command:
    "运行本地命令。订单任务用它调用包内 read/write 脚本读取 CSV、写 JSON 报告。",
  view_image: "查看本地图片；纯 CSV 或文本任务不需要。",
};
