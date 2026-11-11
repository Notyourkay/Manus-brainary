import { TerminalExecutor } from "@brainary/poa-sdk";

const terminal = new TerminalExecutor();

export async function runNode(source: string): Promise<string> {
  // 单引号 heredoc 阻止 shell 展开；数据用 JSON 序列化写入脚本，不拼成 shell 参数。
  const lines = await terminal.shell_lines(
    `node --input-type=module <<'MANUS_NODE_SCRIPT'\n${source}\nMANUS_NODE_SCRIPT`,
    { max_output_tokens: 1500 },
  );
  return lines.join("\n");
}

export async function writeFiles(
  directory: string,
  files: Record<string, string>,
): Promise<void> {
  await runNode(`
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const directory = ${JSON.stringify(directory)};
const files = ${JSON.stringify(files)};
await mkdir(directory, { recursive: true });
for (const [name, content] of Object.entries(files)) await writeFile(join(directory, name), content);
`);
}
