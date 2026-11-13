import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publishLearning } from "../resources/learning.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(
  process.argv[2] ?? join(repo, ".local", `rsi-demo-${Date.now()}`),
);
await mkdir(dirname(root), { recursive: true });
await mkdir(root);
const memoryRoot = join(root, "artifacts/manus");
const strategy = {
  id: "demo-human-two-step-v1",
  parentId: null,
  scenario: "order-audit",
  instructions:
    "这是人工编写的旧版演示策略，用于真实比较流程冗余。订单核对必须生成两个顺序步骤：第一步由无工具的规则整理角色重述本次领域规则及核对清单，既不计算也不声称已读取数据；它的验收条件只检查清单完整。第二步由持有 exec_command 的对账角色实际 read、计算、write 并交付报告，inputFrom 引用第一步。两步均 maxRevisions=0，引用全部规则。不要把第一步合并进第二步。",
  sourceRunIds: [],
  createdAt: new Date().toISOString(),
};
await publishLearning(memoryRoot, {
  strategies: { "order-audit": strategy },
  experiences: [],
});
const requestFile = join(root, "request.json");
await writeFile(
  requestFile,
  JSON.stringify(
    {
      request: `请核对 ${join(repo, "examples/orders-a.csv")} 的订单结算，排除取消订单，按整数分计算退款后净额，按客户汇总并落盘报告。`,
    },
    null,
    2,
  ),
);
await writeFile(
  join(root, "demo.json"),
  JSON.stringify(
    {
      root,
      memoryRoot,
      requestFile,
      strategy,
      description:
        "人工旧策略；运行、工具结果与 RSI 收益均由后续真实执行产生。",
    },
    null,
    2,
  ),
);
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
console.log(
  `演示目录：${root}\n人工旧策略：${strategy.id}\n\n执行：\ncd ${quote(root)}\nexport MANUS_MEMORY_ROOT=${quote(memoryRoot)}\nexport MANUS_INPUT_FILE=${quote(requestFile)}\n/Users/notyourkay/brainary-rc-0.2.0/bin/brainary --add-dir ${quote(repo)}\n\nTUI：\n/poa fg ${join(repo, "dist/manus.poa")}\n\n完成后记下运行目录，再运行：\n/poa fg ${join(repo, "dist/manus-rsi.poa")}\nRSI 只问一次来源运行目录。生成入口与 RSI 入口的输入分别独立。`,
);
