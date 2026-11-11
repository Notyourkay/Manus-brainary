import { existsSync } from "node:fs";
import { defineConfig, rolldown } from "rolldown";

const input = existsSync("src/main.ts") ? "src/main.ts" : "src/main.js";

export default defineConfig({
  input,
  plugins: [
    {
      name: "embedded-task-program",
      resolveId(id) {
        if (id === "virtual:task-program") return "\0task-program";
      },
      async load(id) {
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
});
