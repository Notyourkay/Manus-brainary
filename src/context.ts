import defaultExperiences from "../knowledge/experiences.json";
import domain from "../knowledge/order-audit.json";
import type {
  DomainKnowledge,
  Episode,
  Experience,
  TaskContext,
  TaskMethod,
} from "./contracts.js";
import { runNode } from "./files.js";

export const bundledExperiences: Experience[] =
  defaultExperiences as Experience[];
export function selectContext(
  method: TaskMethod,
  experiences: Experience[],
  episodes: Episode[],
  pinnedDomain?: DomainKnowledge | null,
): TaskContext {
  return {
    domain:
      pinnedDomain === undefined
        ? method.scenario === "order-audit"
          ? (domain as DomainKnowledge)
          : null
        : pinnedDomain,
    experiences: experiences.filter(
      (item) => item.scenario === method.scenario,
    ),
    episodes,
    selection: `按场景 ${method.scenario} 选择资料和人工经验；历史按场景及目标关键词匹配，最多取 3 条。`,
  };
}
export async function loadContext(options: {
  method: TaskMethod;
  memoryRoot: string;
  experienceFile: string | null;
  runDirectory: string;
  runId: string;
  experiences?: Experience[];
  domain?: DomainKnowledge | null;
}): Promise<TaskContext> {
  const loaded = JSON.parse(
    await runNode(`
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
const {rebuildIndex, queryEpisodes} = await import(pathToFileURL(${JSON.stringify(`${options.runDirectory}/resources/memory.mjs`)}));
const root = ${JSON.stringify(options.memoryRoot)};
const path = ${JSON.stringify(options.experienceFile)};
console.log(JSON.stringify({
  experiences: path ? JSON.parse(await readFile(path,"utf8")) : null,
  episodes: queryEpisodes(await rebuildIndex(root), ${JSON.stringify(options.method.scenario)}, ${JSON.stringify(options.method.objective)}, ${JSON.stringify(options.runId)})
}));
`),
  );
  const experiences =
    loaded.experiences === null
      ? (options.experiences ?? bundledExperiences)
      : parseExperiences(loaded.experiences, options.experienceFile as string);
  return selectContext(
    options.method,
    experiences,
    loaded.episodes,
    options.domain,
  );
}
export function parseExperiences(value: unknown, source: string): Experience[] {
  if (!Array.isArray(value)) throw new Error("人工经验文件必须为数组。");
  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !["id", "version", "content", "source"].every(
        (key) => typeof item[key] === "string" && item[key].trim(),
      ) ||
      !["text", "order-audit"].includes(item.scenario)
    )
      throw new Error("人工经验条目缺少 ID、版本、场景、内容或来源。");
    return {
      ...item,
      source: `${source}#${item.id}；${item.source}`,
    } as Experience;
  });
}
