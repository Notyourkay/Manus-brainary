import { strToU8, zipSync } from "fflate";
import type { TaskEntryMode, TaskPackage } from "./contracts.js";
import { runNode } from "./files.js";

export function buildTaskArchive(
  pkg: TaskPackage,
  program: string,
  entryMode: TaskEntryMode = "replay",
): Uint8Array {
  const asset = pkg.asset;
  const calls = asset.bundle.steps.reduce(
    (total, step) => total + 2 * (step.maxRevisions + 1),
    0,
  );
  const pragma = JSON.stringify({
    yield_time_ms: calls * asset.config.agentTimeoutMs + 60_000,
    max_output_tokens: 10_000,
  });
  const main = `// @exec: ${pragma}\nconst MANUS_ENTRY_MODE = ${JSON.stringify(entryMode)};\nconst MANUS_PACKAGE = ${JSON.stringify(pkg)};\n${program}`;
  const manifest = `[poa]\nnamespace = "manus"\nname = "task_${asset.assetId}${entryMode === "new" ? "_new" : ""}"\nversion = "0.1.0"\nruntime = "codex-v8"\npoa_api_version = 1\nentry = "main.js"\n`;
  return zipSync(
    {
      "main.js": strToU8(main),
      "manifest.toml": strToU8(manifest),
      "asset.json": strToU8(JSON.stringify(asset, null, 2)),
      "original-request.json": strToU8(
        JSON.stringify({ request: pkg.originalRequest }, null, 2),
      ),
      "original-input.json": strToU8(
        JSON.stringify(pkg.originalInput, null, 2),
      ),
      "dependencies.json": strToU8(JSON.stringify(asset.dependencies, null, 2)),
      "verification.json": strToU8(JSON.stringify(pkg.verification, null, 2)),
      "experiences.json": strToU8(JSON.stringify(pkg.experiences, null, 2)),
      ...Object.fromEntries(
        Object.entries(pkg.resources).map(([name, source]) => [
          `resources/${name}`,
          strToU8(source),
        ]),
      ),
    },
    { level: 6, mtime: new Date(1980, 0, 1) },
  );
}

export async function exportTaskPackages(
  pkg: TaskPackage,
  program: string,
  directory: string,
): Promise<{ replay: string; newTask: string }> {
  const paths = {
    replay: `${directory}/task.poa`,
    newTask: `${directory}/task-new.poa`,
  };
  await runNode(`
import { writeFile } from "node:fs/promises";
await writeFile(${JSON.stringify(paths.replay)}, Buffer.from(${JSON.stringify(toBase64(buildTaskArchive(pkg, program)))}, "base64"));
await writeFile(${JSON.stringify(paths.newTask)}, Buffer.from(${JSON.stringify(toBase64(buildTaskArchive(pkg, program, "new")))}, "base64"));
`);
  return paths;
}

function toBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n =
      (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    result += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63];
    result += i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : "=";
    result += i + 2 < bytes.length ? alphabet[n & 63] : "=";
  }
  return result;
}
