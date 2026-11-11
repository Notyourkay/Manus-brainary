import type { ManusConfig } from "./contracts.js";

export const config: ManusConfig = {
  model: { model_id: "gpt-5.6-sol", provider: "custom" },
  availableTools: [],
  agentTimeoutMs: 180_000,
  artifactRoot: "artifacts/manus",
};
