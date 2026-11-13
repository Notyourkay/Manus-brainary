import type { TaskPackage } from "../contracts.js";
import { runNode } from "../files.js";
import { parseGeneration } from "../generator.js";
import type { LearningState, RsiSource } from "./contracts.js";

export async function loadLearning(
  root: string,
  resourceDirectory: string,
): Promise<LearningState> {
  return JSON.parse(
    await runNode(`
import {pathToFileURL} from "node:url";
const {loadLearning}=await import(pathToFileURL(${JSON.stringify(`${resourceDirectory}/resources/learning.mjs`)}));
console.log(JSON.stringify(await loadLearning(${JSON.stringify(root)})));
`),
  );
}
export async function publishLearning(
  root: string,
  resourceDirectory: string,
  update: Pick<LearningState, "strategies" | "experiences">,
): Promise<void> {
  await runNode(`
import {pathToFileURL} from "node:url";
const {publishLearning}=await import(pathToFileURL(${JSON.stringify(`${resourceDirectory}/resources/learning.mjs`)}));
await publishLearning(${JSON.stringify(root)},${JSON.stringify(update)});
`);
}
export async function readSource(directory: string): Promise<RsiSource> {
  const value = JSON.parse(
    await runNode(`
import {readFile,readdir} from "node:fs/promises";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
const directory=resolve(${JSON.stringify(directory)});
const json=async path=>JSON.parse(await readFile(path,"utf8"));
const record=await json(join(directory,"record.json"));
const assetDirectory=resolve(directory,"../../assets",record.assetId);
const asset=await json(join(assetDirectory,"asset.json"));
const resources=Object.fromEntries(await Promise.all((await readdir(join(directory,"resources"))).map(async name=>[name,await readFile(join(directory,"resources",name),"utf8")])));
const hashes={};
for(const name of ["asset.json","original-request.json","original-input.json","task.poa"]){
 try{hashes[join(assetDirectory,name)]=createHash("sha256").update(await readFile(join(assetDirectory,name))).digest("hex");}
 catch(error){if(error.code!=="ENOENT")throw error;}
}
let toolReceipts=[];
try{toolReceipts=(await readFile(join(directory,"tool-calls.jsonl"),"utf8")).trim().split("\\n").filter(Boolean).map(JSON.parse);}catch(error){if(error.code!=="ENOENT")throw error;}
const trace=(await readFile(join(directory,"trace.jsonl"),"utf8")).trim().split("\\n").filter(Boolean).map(JSON.parse);
if(!record.input || createHash("sha256").update(record.input.content).digest("hex")!==record.input.sha256)throw new Error("来源材料哈希不一致。");
console.log(JSON.stringify({directory,record,asset,resources,hashes,toolReceipts,agentCalls:trace.filter(e=>e.type==="agent_requested").length}));
`),
  );
  return parseSource(value);
}

export function parseSource(value: {
  directory: string;
  record: RsiSource["record"];
  asset: TaskPackage["asset"];
  resources: TaskPackage["resources"];
  hashes: RsiSource["hashes"];
  toolReceipts: unknown[];
  agentCalls: number;
}): RsiSource {
  const { record, asset } = value;
  if (
    record.version !== 2 ||
    asset.version !== 2 ||
    record.assetId !== asset.assetId ||
    !["completed", "failed", "error"].includes(record.status) ||
    !record.finishedAt ||
    record.method?.scenario !== "order-audit" ||
    !record.input ||
    !record.request ||
    !record.context?.domain ||
    JSON.stringify(record.bundle) !== JSON.stringify(asset.bundle)
  )
    throw new Error(
      "RSI 需要已结束且具有完整订单资产、输入与上下文的运行目录。",
    );
  parseGeneration(
    JSON.stringify({
      status: "ready",
      method: asset.method,
      material: record.input.source,
      bundle: asset.bundle,
    }),
    record.context,
    asset.config,
  );
  const pkg: TaskPackage = {
    asset,
    originalRequest: record.request,
    originalInput: record.input,
    resources: value.resources,
    experiences: record.context.experiences,
    verification: [
      {
        runId: record.runId,
        input: record.input,
        status: record.status,
        executionStatus: record.execution?.status ?? null,
        acceptance: record.acceptance,
        conditions: record.conditions,
        finishedAt: record.finishedAt,
      },
    ],
  };
  return {
    directory: value.directory,
    record,
    pkg,
    hashes: value.hashes,
    toolReceipts: value.toolReceipts,
    agentCalls: value.agentCalls,
  };
}

export async function freshId(): Promise<string> {
  return (
    await runNode(
      'import {randomUUID} from "node:crypto"; console.log(randomUUID());',
    )
  ).trim();
}

export async function openCycle(
  artifactRoot: string,
): Promise<{ cycleId: string; directory: string; memoryRoot: string }> {
  return JSON.parse(
    await runNode(`
import {mkdir} from "node:fs/promises";
import {resolve,join} from "node:path";
import {randomUUID} from "node:crypto";
const cycleId=randomUUID(), root=resolve(${JSON.stringify(artifactRoot)});
const directory=join(root,"rsi",cycleId);
await mkdir(directory,{recursive:true});
console.log(JSON.stringify({cycleId,directory,memoryRoot:resolve(process.env.MANUS_MEMORY_ROOT || root)}));
`),
  );
}
