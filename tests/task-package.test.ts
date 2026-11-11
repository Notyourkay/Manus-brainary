import vm from "node:vm";
import { strFromU8, unzipSync } from "fflate";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { parseBundle } from "../src/bundle.js";
import { config } from "../src/config.js";
import type { TaskAsset } from "../src/contracts.js";
import { buildTaskArchive } from "../src/task-package.js";
import fixture from "./fixtures/bundle.json";

describe("standalone task package", () => {
  it("carries task data and executable code without an external source import", () => {
    const asset: TaskAsset = {
      version: 1,
      assetId: "acceptance-asset",
      createdAt: "2026-11-11T00:00:00.000Z",
      task: {
        description: '包含中文、引号"、换行\n以及 `代码` 和 $(shell) 的任务',
      },
      config,
      bundle: parseBundle(JSON.stringify(fixture), []),
      generatorVersion: "v1",
      executorVersion: "v1",
    };
    const archive = unzipSync(buildTaskArchive(asset, "text(MANUS_ASSET);"));
    expect(Object.keys(archive).sort()).toEqual([
      "asset.json",
      "main.js",
      "manifest.toml",
    ]);
    expect(parse(strFromU8(archive["manifest.toml"])).poa).toMatchObject({
      runtime: "codex-v8",
      entry: "main.js",
    });
    expect(JSON.parse(strFromU8(archive["asset.json"]))).toEqual(asset);
    let delivered: unknown;
    vm.runInNewContext(strFromU8(archive["main.js"]), {
      text(value: unknown) {
        delivered = value;
      },
    });
    expect(JSON.parse(JSON.stringify(delivered))).toEqual(asset);
  });
});
