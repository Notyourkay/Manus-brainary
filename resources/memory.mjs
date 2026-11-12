import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function rebuildIndex(root, additionalSources = []) {
  const runs = join(root, "runs");
  await mkdir(runs, { recursive: true });
  const indexPath = join(root, "episodes", "index.json");
  let previous = [];
  try {
    previous = JSON.parse(await readFile(indexPath, "utf8")).episodes;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const entries = await readdir(runs, { withFileTypes: true });
  const sources = new Set([
    ...previous.map((item) => item.source),
    ...entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(runs, entry.name, "record.json")),
    ...additionalSources,
  ]);
  const episodes = [];
  for (const source of sources) {
    let record;
    try {
      record = JSON.parse(await readFile(source, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (record.status === "running") continue;
    const objective =
      record.method?.objective ?? record.task?.description ?? "";
    episodes.push({
      runId: record.runId,
      assetId: record.assetId,
      scenario:
        record.method?.scenario ??
        (/订单|结算|order|csv/iu.test(objective) ? "order-audit" : "text"),
      objective,
      status: record.status,
      summary: record.acceptance
        ? `客观检查：${record.acceptance.passed ? "通过" : "未通过"}；${record.acceptance.checks.map((item) => `${item.id}=${item.passed}`).join("，")}`
        : String(
            record.execution?.finalOutput ?? record.error ?? record.status,
          ).slice(0, 200),
      source,
      finishedAt: record.finishedAt ?? null,
    });
  }
  episodes.sort((a, b) =>
    (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""),
  );
  await mkdir(join(root, "episodes"), { recursive: true });
  await writeFile(
    join(root, "episodes", "index.json"),
    JSON.stringify(
      { version: 1, updatedAt: new Date().toISOString(), episodes },
      null,
      2,
    ),
  );
  return episodes;
}
export function queryEpisodes(episodes, scenario, query, excludeRunId = "") {
  const words = query
    .toLowerCase()
    .split(/[\s，。；、,;]+/u)
    .filter(Boolean);
  return episodes
    .filter((item) => item.runId !== excludeRunId && item.scenario === scenario)
    .map((item) => ({
      item,
      score: words.filter((word) => item.objective.toLowerCase().includes(word))
        .length,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.item.finishedAt ?? "").localeCompare(a.item.finishedAt ?? ""),
    )
    .slice(0, 3)
    .map(({ item }) => item);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [directory, scenario = "order-audit", query = "订单"] =
    process.argv.slice(2);
  if (!directory)
    throw new Error("Usage: node memory.mjs <memory-root> [scenario] [query]");
  console.log(
    JSON.stringify(
      queryEpisodes(await rebuildIndex(resolve(directory)), scenario, query),
      null,
      2,
    ),
  );
}
