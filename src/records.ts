import { Kind, PoA } from "@brainary/poa-sdk";
import type {
  ManusConfig,
  RunInput,
  RunRecord,
  TaskAsset,
  TaskMethod,
  TaskPackage,
  TraceEvent,
  Verification,
} from "./contracts.js";
import { runNode, writeFiles } from "./files.js";
import { emptyMonitoring, type Monitoring } from "./monitoring.js";
import {
  memorySchema,
  projectWorkingMemory,
  readWorkingMemory,
  type StoredWorkingMemory,
  storeWorkingMemory,
  type WorkingMemory,
} from "./working-memory.js";

export const GENERATOR_VERSION = "manus-generator-v2.0";
export const EXECUTOR_VERSION = "manus-executor-v2.1";
export interface RunPaths {
  runId: string;
  assetId: string;
  runDirectory: string;
  assetDirectory: string;
  memoryRoot: string;
  experienceFile: string | null;
}
export class RunJournal {
  private constructor(
    readonly paths: RunPaths,
    readonly record: RunRecord & { monitoring: Monitoring },
    private readonly memory: PoA,
  ) {}
  static async open(
    method: TaskMethod,
    config: ManusConfig,
    mode: RunRecord["mode"],
    asset?: TaskAsset,
  ): Promise<RunJournal> {
    const environment = JSON.parse(
      await runNode(`
import {mkdir} from "node:fs/promises";
import {resolve,join} from "node:path";
import {randomUUID} from "node:crypto";
const root = resolve(${JSON.stringify(config.artifactRoot)});
const runId = randomUUID(), assetId = ${JSON.stringify(asset?.assetId ?? null)} ?? randomUUID();
const runDirectory=join(root,"runs",runId), assetDirectory=join(root,"assets",assetId);
await mkdir(runDirectory,{recursive:true}); await mkdir(assetDirectory,{recursive:true});
console.log(JSON.stringify({
  paths:{runId,assetId,runDirectory,assetDirectory,memoryRoot:resolve(process.env.MANUS_MEMORY_ROOT || root),experienceFile:process.env.MANUS_EXPERIENCE_FILE ? resolve(process.env.MANUS_EXPERIENCE_FILE) : null},
  conditions:{node:process.version,platform:process.platform,arch:process.arch,cwd:process.cwd()}
}));
`),
    );
    const paths: RunPaths = environment.paths;
    const record: RunRecord & { monitoring: Monitoring } = {
      version: 2,
      monitoring: emptyMonitoring(),
      runId: paths.runId,
      assetId: paths.assetId,
      mode,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      config,
      method,
      request: "",
      input: null,
      context: null,
      bundle: asset?.bundle ?? null,
      execution: null,
      acceptance: null,
      error: null,
      conditions: {
        ...environment.conditions,
        model: config.model,
        sdkVersion: "0.2.0-rc",
        requiredBrainary: "0.2.0-rc",
        tools: config.availableTools,
      },
      generatorVersion: asset?.generatorVersion ?? GENERATOR_VERSION,
      executorVersion: EXECUTOR_VERSION,
      ...(asset?.generationStrategy
        ? { generationStrategy: asset.generationStrategy }
        : {}),
    };
    const memory = await runMemory();
    const journal = new RunJournal(paths, record, memory);
    await writeFiles(paths.runDirectory, {
      "record.json": JSON.stringify(record, null, 2),
    });
    await journal.trace({ type: "run_started", mode, method });
    await journal.save();
    return journal;
  }
  async setRequest(request: string): Promise<void> {
    this.record.request = request;
    await writeFiles(this.paths.runDirectory, {
      "request.json": JSON.stringify({ request }, null, 2),
    });
    await this.trace({ type: "task_received", request });
    await this.save();
  }
  async setInput(input: RunInput): Promise<void> {
    this.record.input = input;
    await writeFiles(this.paths.runDirectory, {
      "input.json": JSON.stringify(input, null, 2),
      [this.record.method.inputKind === "csv" && input.source !== "user:text"
        ? "input.csv"
        : "input.txt"]: input.content,
    });
    await this.trace({
      type: "input_captured",
      source: input.source,
      sha256: input.sha256,
    });
    await this.save();
  }
  async trace(event: TraceEvent): Promise<void> {
    const entry = {
      ...event,
      time: new Date().toISOString(),
      runId: this.record.runId,
      assetId: this.record.assetId,
    };
    await runNode(`
import {appendFile} from "node:fs/promises";
await appendFile(${JSON.stringify(`${this.paths.runDirectory}/trace.jsonl`)},${JSON.stringify(`${JSON.stringify(entry)}\n`)});
`);
  }
  async save(): Promise<void> {
    const files: Record<string, string> = {
      "record.json": JSON.stringify(this.record, null, 2),
    };
    for (const [name, value] of Object.entries({
      bundle: this.record.bundle,
      execution: this.record.execution,
      metacognition: this.record.monitoring,
    })) {
      if (value) files[`${name}.json`] = JSON.stringify(value, null, 2);
    }
    await writeFiles(this.paths.runDirectory, files);
    await this.memory.load_data(
      Kind.WM,
      storeWorkingMemory(
        projectWorkingMemory(this.record, this.paths.runDirectory),
      ),
    );
    await writeFiles(this.paths.runDirectory, {
      "wm-snapshot.json": JSON.stringify(
        await this.memory.read_data(Kind.WM),
        null,
        2,
      ),
    });
  }
  async readWorkingMemory(): Promise<WorkingMemory> {
    return readWorkingMemory(
      (await this.memory.read_data(Kind.WM)) as unknown as StoredWorkingMemory,
    );
  }
  verification(): Verification {
    return {
      runId: this.record.runId,
      input: this.record.input as RunInput,
      status: this.record.status,
      executionStatus: this.record.execution?.status ?? null,
      acceptance: this.record.acceptance,
      conditions: this.record.conditions,
      finishedAt: this.record.finishedAt,
    };
  }
  async saveAsset(pkg: TaskPackage, includeRun = false): Promise<void> {
    await writeFiles(this.paths.assetDirectory, {
      "asset.json": JSON.stringify(pkg.asset, null, 2),
      "original-input.json": JSON.stringify(pkg.originalInput, null, 2),
      "original-request.json": JSON.stringify(
        { request: pkg.originalRequest },
        null,
        2,
      ),
      "dependencies.json": JSON.stringify(pkg.asset.dependencies, null, 2),
    });
    const verifications = [
      ...pkg.verification,
      ...(includeRun ? [this.verification()] : []),
    ];
    await runNode(`
import {readFile,writeFile} from "node:fs/promises";
const path=${JSON.stringify(`${this.paths.assetDirectory}/asset-state.json`)};
let previous={verifications:[],humanAcceptance:{status:"pending"}};
try {previous=JSON.parse(await readFile(path,"utf8"));} catch(error) {if(error.code!=="ENOENT")throw error;}
const runs=[...new Map([...previous.verifications,...${JSON.stringify(verifications)}].map(item=>[item.runId,item])).values()];
const executed=runs.some(item=>item.executionStatus!==null);
const validated=runs.some(item=>item.status==="completed" && item.acceptance?.kind==="objective" && item.acceptance.passed);
await writeFile(path,JSON.stringify({version:1,assetId:${JSON.stringify(pkg.asset.assetId)},generatedAt:${JSON.stringify(pkg.asset.createdAt)},status:validated?"validated":executed?"executed":"generated",milestones:{generated:true,executed,validated},humanAcceptance:previous.humanAcceptance,verifications:runs},null,2));
`);
  }
  async updateIndex(): Promise<void> {
    await runNode(`
import {pathToFileURL} from "node:url";
const {rebuildIndex}=await import(pathToFileURL(${JSON.stringify(`${this.paths.runDirectory}/resources/memory.mjs`)}));
await rebuildIndex(${JSON.stringify(this.paths.memoryRoot)}, [${JSON.stringify(`${this.paths.runDirectory}/record.json`)}]);
`);
  }
  async fail(error: unknown): Promise<void> {
    this.record.status = "error";
    this.record.error = String(error);
    this.record.finishedAt = new Date().toISOString();
    await this.trace({ type: "run_error", error: this.record.error });
    await this.save();
  }
}

let workingMemory: PoA | undefined;
async function runMemory(): Promise<PoA> {
  if (workingMemory) return workingMemory;
  // 0.2.0-rc 的 WM 作用域属于本次 PoA 执行，agent_id 不创建独立的声明空间。
  const memory = new PoA({ agent_id: "manus-run-journal" });
  await memory.register_schema(Kind.WM, memorySchema);
  workingMemory = memory;
  return memory;
}
