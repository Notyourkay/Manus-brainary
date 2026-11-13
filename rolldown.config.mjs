import { existsSync, readFileSync } from "node:fs";
import { defineConfig, rolldown } from "rolldown";

const input = existsSync("src/main.ts") ? "src/main.ts" : "src/main.js";

const main = {
  input,
  plugins: [
    {
      name: "embedded-task-program",
      resolveId(id) {
        if (id === "virtual:rsi-cases") return "\0rsi-cases";
        if (id === "virtual:task-program") return "\0task-program";
        if (id === "virtual:task-resources") return "\0task-resources";
      },
      async load(id) {
        if (id === "\0rsi-cases") {
          const suite = JSON.parse(
            readFileSync("examples/rsi-suite.json", "utf8"),
          );
          suite.materials = Object.fromEntries(
            ["orders-b", "orders-c"].map((id) => [
              id,
              readFileSync(`examples/${id}.csv`, "utf8"),
            ]),
          );
          return `export default ${JSON.stringify(suite)};`;
        }
        if (id === "\0task-resources") {
          const files = [
            "table-core.mjs",
            "order-tools.mjs",
            "memory.mjs",
            "learning.mjs",
            "evaluation.mjs",
          ];
          return `export default ${JSON.stringify(Object.fromEntries(files.map((name) => [name, readFileSync(`resources/${name}`, "utf8")])))};`;
        }
        if (id !== "\0task-program") return;
        const task = await rolldown({ input: "src/task-main.ts" });
        try {
          const { output } = await task.generate({
            format: "esm",
            minify: true,
          });
          return `export default ${JSON.stringify(output[0].code)};`;
        } finally {
          await task.close();
        }
      },
    },
  ],
  output: {
    // 前台 PoA 默认会提前 yield；Demo 留出完整生成与执行的等待窗口。
    banner: '// @exec: {"yield_time_ms": 900000, "max_output_tokens": 10000}',
    dir: "dist",
    entryFileNames: "main.js",
    format: "esm",
    sourcemap: false,
  },
};

export default defineConfig([
  main,
  {
    ...main,
    input: "src/rsi-main.ts",
    output: {
      ...main.output,
      entryFileNames: "rsi.js",
      banner:
        '// @exec: {"yield_time_ms": 14400000, "max_output_tokens": 10000}',
    },
  },
  {
    input: "src/rsi/comparison.ts",
    output: { file: "dist/rsi-comparison.mjs", format: "esm" },
  },
  {
    input: "src/rsi/measurement.ts",
    output: { file: "dist/rsi-measurement.mjs", format: "esm" },
  },
  {
    input: "src/validation.ts",
    output: { file: "dist/validation.mjs", format: "esm" },
  },
]);
