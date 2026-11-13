import vm from "node:vm";
import { strFromU8, unzipSync } from "fflate";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { parseBundle } from "../src/bundle.js";
import { config } from "../src/config.js";
import type { TaskPackage } from "../src/contracts.js";
import { buildTaskArchive } from "../src/task-package.js";
import fixture from "./fixtures/bundle.json";

describe("natural-language standalone package", () => {
  it("ships method, original material, tools and verification separately", () => {
    const pkg: TaskPackage = {
      originalRequest: "请整理这段材料",
      asset: {
        version: 2,
        assetId: "test-asset",
        createdAt: "2026-11-12T00:00:00Z",
        method: { objective: "整理材料", scenario: "text", inputKind: "text" },
        config,
        bundle: parseBundle(JSON.stringify(fixture), []),
        domain: null,
        dependencies: {
          brainary: "0.2.0-rc",
          sdk: "0.2.0-rc",
          node: ">=22",
          modelConfiguration: config.model,
          tools: [],
          externalServices: [],
          resources: ["tool.mjs"],
        },
        generatorVersion: "v1.1",
        executorVersion: "v1.1",
      },
      originalInput: {
        source: "user:text",
        content: '特殊材料：引号"、换行\n、`代码` 和 $(shell)',
        sha256: "fixture",
      },
      resources: { "tool.mjs": "console.log('tool');" },
      experiences: [],
      verification: [],
    };
    const files = unzipSync(buildTaskArchive(pkg, "text(MANUS_PACKAGE);"));
    expect(parse(strFromU8(files["manifest.toml"])).poa).toMatchObject({
      entry: "main.js",
      runtime: "codex-v8",
    });
    expect(JSON.parse(strFromU8(files["asset.json"]))).toEqual(pkg.asset);
    expect(strFromU8(files["asset.json"])).not.toContain("特殊材料");
    expect(JSON.parse(strFromU8(files["original-input.json"]))).toEqual(
      pkg.originalInput,
    );
    expect(strFromU8(files["resources/tool.mjs"])).toBe(
      pkg.resources["tool.mjs"],
    );
    expect(JSON.parse(strFromU8(files["verification.json"]))).toEqual([]);
    let delivered: unknown;
    vm.runInNewContext(strFromU8(files["main.js"]), {
      text(value: unknown) {
        delivered = value;
      },
    });
    expect(JSON.parse(JSON.stringify(delivered))).toEqual(pkg);
  });
});
