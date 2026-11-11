import { Kind, PoA } from "@brainary/poa-sdk";
import type {
  ManusConfig,
  RunRecord,
  TaskAsset,
  TaskRequest,
  TraceEvent,
} from "./contracts.js";
import { runNode, writeFiles } from "./files.js";

export const GENERATOR_VERSION = "manus-generator-v1";
export const EXECUTOR_VERSION = "manus-executor-v1";

const memorySchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "manus-run-v1",
  type: "object",
  additionalProperties: false,
  required: ["run_id", "asset_id", "record"],
  properties: {
    run_id: { type: "string" },
    asset_id: { type: "string" },
    record: { type: "string" },
  },
};

interface RunPaths {
  runId: string;
  assetId: string;
  runDirectory: string;
  assetDirectory: string;
}

export class RunJournal {
  private constructor(
    readonly paths: RunPaths,
    readonly record: RunRecord,
    private readonly memory: PoA,
  ) {}

  static async open(
    task: TaskRequest,
    config: ManusConfig,
    asset?: TaskAsset,
  ): Promise<RunJournal> {
    const paths: RunPaths = JSON.parse(
      await runNode(`
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
const root = resolve(${JSON.stringify(config.artifactRoot)});
const runId = randomUUID();
const assetId = ${JSON.stringify(asset?.assetId ?? null)} ?? randomUUID();
const runDirectory = join(root, "runs", runId);
const assetDirectory = join(root, "assets", assetId);
await mkdir(runDirectory, {recursive:true});
await mkdir(assetDirectory, {recursive:true});
console.log(JSON.stringify({runId,assetId,runDirectory,assetDirectory}));
`),
    );
    const record: RunRecord = {
      version: 1,
      runId: paths.runId,
      assetId: paths.assetId,
      mode: asset ? "replay" : "generate",
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      task,
      config,
      bundle: asset?.bundle ?? null,
      execution: null,
      error: null,
      generatorVersion: asset?.generatorVersion ?? GENERATOR_VERSION,
      executorVersion: asset?.executorVersion ?? EXECUTOR_VERSION,
    };
    const memory = new PoA({ agent_id: paths.runId });
    const journal = new RunJournal(paths, record, memory);
    await writeFiles(paths.runDirectory, {
      "record.json": JSON.stringify(record, null, 2),
    });
    await journal.trace({
      type: "run_started",
      mode: record.mode,
      task,
      config,
    });
    await memory.register_schema(Kind.WM, memorySchema);
    await journal.save();
    return journal;
  }

  async trace(event: TraceEvent): Promise<void> {
    const entry = {
      ...event,
      time: new Date().toISOString(),
      runId: this.record.runId,
      assetId: this.record.assetId,
    };
    await runNode(`
import { appendFile } from "node:fs/promises";
await appendFile(${JSON.stringify(`${this.paths.runDirectory}/trace.jsonl`)}, ${JSON.stringify(`${JSON.stringify(entry)}\n`)});
`);
  }

  async save(): Promise<void> {
    const record = JSON.stringify(this.record, null, 2);
    await writeFiles(this.paths.runDirectory, { "record.json": record });
    await this.memory.load_data(Kind.WM, {
      run_id: this.record.runId,
      asset_id: this.record.assetId,
      record,
    });
    const snapshot = await this.memory.read_data(Kind.WM);
    await writeFiles(this.paths.runDirectory, {
      "wm-snapshot.json": JSON.stringify(snapshot, null, 2),
    });
  }

  async fail(error: unknown): Promise<void> {
    this.record.status = "error";
    this.record.error = String(error);
    this.record.finishedAt = new Date().toISOString();
    await this.trace({ type: "run_error", error: this.record.error });
    await this.save();
  }
}
