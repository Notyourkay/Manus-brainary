import { type BrainaryTool, parse_json_reply } from "@brainary/poa-sdk";
import Ajv, { type JSONSchemaType } from "ajv";
import type { GeneratedBundle, Review } from "./contracts.js";

export const bundleSchema: JSONSchemaType<GeneratedBundle> = {
  type: "object",
  additionalProperties: false,
  required: ["version", "summary", "agents", "steps"],
  properties: {
    version: { type: "number", const: 1 },
    summary: { type: "string", minLength: 1 },
    agents: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "systemPrompt", "knowledge", "tools"],
        properties: {
          id: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1 },
          systemPrompt: { type: "string", minLength: 1 },
          knowledge: { type: "array", items: { type: "string" } },
          tools: {
            type: "array",
            uniqueItems: true,
            items: { type: "string" },
          },
        },
      },
    },
    steps: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "agentId",
          "instruction",
          "inputFrom",
          "acceptanceCriteria",
          "maxRevisions",
          "knowledgeRefs",
        ],
        properties: {
          id: { type: "string", minLength: 1 },
          agentId: { type: "string", minLength: 1 },
          instruction: { type: "string", minLength: 1 },
          inputFrom: {
            type: "array",
            uniqueItems: true,
            items: { type: "string" },
          },
          acceptanceCriteria: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
          knowledgeRefs: {
            type: "array",
            uniqueItems: true,
            items: { type: "string" },
          },
          maxRevisions: { type: "number", enum: [0, 1] },
        },
      },
    },
  },
};

export const reviewSchema: JSONSchemaType<Review> = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "feedback"],
  properties: {
    passed: { type: "boolean" },
    feedback: { type: "string", minLength: 1 },
  },
};

const ajv = new Ajv({ allErrors: true, logger: false });
const validateBundle = ajv.compile(bundleSchema);
const validateReview = ajv.compile(reviewSchema);

export function parseBundle(
  raw: string,
  availableTools: readonly BrainaryTool[],
  knownRefs: readonly string[] = [],
): GeneratedBundle {
  const reply = parse_json_reply<unknown>(raw);
  if (reply.error !== null)
    throw new Error(`生成结果不是有效 JSON：${reply.error}`);
  if (!validateBundle(reply.value)) {
    throw new Error(
      `生成结果不符合契约：${ajv.errorsText(validateBundle.errors)}`,
    );
  }
  validateReferences(reply.value, availableTools);
  for (const step of reply.value.steps) {
    for (const id of step.knowledgeRefs) {
      if (!knownRefs.includes(id)) throw new Error(`未知知识引用：${id}`);
    }
  }
  return reply.value;
}

export function parseReview(raw: string): Review {
  const reply = parse_json_reply<unknown>(raw);
  if (reply.error !== null)
    throw new Error(`检查结果不是有效 JSON：${reply.error}`);
  if (!validateReview(reply.value)) {
    throw new Error(
      `检查结果不符合契约：${ajv.errorsText(validateReview.errors)}`,
    );
  }
  return reply.value;
}

function validateReferences(
  bundle: GeneratedBundle,
  availableTools: readonly BrainaryTool[],
): void {
  const agents = new Set<string>();
  for (const agent of bundle.agents) {
    if (agents.has(agent.id))
      throw new Error(`Agent 定义 ID 重复：${agent.id}`);
    agents.add(agent.id);
    for (const tool of agent.tools) {
      if (!availableTools.includes(tool))
        throw new Error(`当前任务环境未提供工具：${tool}`);
    }
  }
  const previousSteps = new Set<string>();
  for (const step of bundle.steps) {
    if (previousSteps.has(step.id)) throw new Error(`步骤 ID 重复：${step.id}`);
    if (!agents.has(step.agentId))
      throw new Error(
        `步骤 ${step.id} 引用了不存在的 Agent 定义：${step.agentId}`,
      );
    for (const input of step.inputFrom) {
      if (!previousSteps.has(input))
        throw new Error(`步骤 ${step.id} 的输入必须来自前置步骤：${input}`);
    }
    previousSteps.add(step.id);
  }
}
