import { existsSync } from "node:fs";
import { defineConfig } from "rolldown";

const input = existsSync("src/main.ts") ? "src/main.ts" : "src/main.js";

export default defineConfig({
  input,
  output: {
    dir: "dist",
    entryFileNames: "main.js",
    format: "esm",
    sourcemap: false,
  },
});
