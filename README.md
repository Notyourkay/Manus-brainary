# Manus on Brainary

Manus 根据用户任务生成任务 Agent 与执行方案，通过 Brainary SDK 创建实例并执行。`dist/manus.poa` 负责生成执行，`dist/manus-rsi.poa` 负责对已有运行复盘和改进，均在 Brainary TUI 前台运行。

V1 支持自然语言生成、任务包直接重跑、真实工具、简化领域本体、经历查询与人工经验读取。任务方法与每次材料分开，资产分别记录生成、执行、客观验证和人工签收状态。订单 CSV 结算核对是完整验收场景。V1 已完成。V2 在 `codex/v2-rsi` 增加自动经验提炼、任务 Agent/方案改进、生成策略改进、固定用例真实对照和版本选择；开发及真实联调已完成，等待人工验收。操作和证据集中在各阶段人工验收手册。

当前任务包固定使用包内原请求与材料快照，不再提供新任务交互或显式新输入入口。V2 沿用这一入口，独立的 RSI 入口每次只运行一轮改进。

## 开发依据

- [V2 人工验收手册](docs/acceptance/phase-2.md)：演示准备、RSI 对照、版本使用与证据核查。
- [V2 设计](docs/design/manus-demo-v2-target.md) / [V2 计划](docs/plans/manus-demo-v2.md)：数据契约、选择规则及逐任务人工契约。
- [V1 人工验收手册](docs/acceptance/phase-1.md)：H1—H7 的操作、指标、预期结果和签收表。
- [设计文档](docs/design/manus-demo-v1.md)：定位、展示形式、架构、数据契约、执行语义与验收。
- [实施计划](docs/plans/manus-demo-v1.md)：开发任务、接口和验收步骤。
- [开发规范](AGENTS.md)：用户指定的通用工程规则。

采用轻量 SDD：以设计与契约指导开发，按可运行的小步骤实现、验证和同步文档。工具链沿用 `brainary-poa-template`。

## 安装与构建

使用 Node.js 22.12+ 的 22.x、24.x 或 26+，pnpm `12.14.0`。SDK 固定为 `0.2.0-rc`，安装时沿用锁文件。

```bash
pnpm install --frozen-lockfile && \
pnpm lint && \
pnpm typecheck && \
pnpm test && \
pnpm package
```

构建产物：

- `dist/main.js`：Runtime 执行的 JavaScript。
- `dist/manus.poa`：可分发的 Manus 生成程序包。
- `dist/manus-rsi.poa`：独立的单轮 RSI 程序包。

## 在 TUI 中运行

本机已安装的 rc Runtime：

```bash
/Users/notyourkay/brainary-rc-0.2.0/bin/brainary
```

在 TUI 中输入：

```text
/poa fg /Users/notyourkay/Manus-brainary/dist/manus.poa
```

随后直接输入完整任务。例如“介绍三个适合初学者的时间管理方法”，或“请核对 /path/orders.csv 的订单结算并汇总客户净额”。外层 Manus 理解任务并提取已有资料，生成可复用 Agent；只有必要信息确实缺失时才追问。

无需填写目标/材料字段，也不要求每个任务都有文件。订单 CSV 是验证真实工具与客观结果的场景。Brainary 使用本机默认配置，模型凭据由 Brainary 管理。

生成完成后，TUI 会给出 `/poa fg <任务包路径>`，直接运行 `task.poa` 即可重跑。任务包不读取 POA_INPUT / MANUS_INPUT_FILE；这两个输入通道只用于 Manus 的生成入口。

## 代码布局

```text
src/main.ts        串起输入、生成、执行与展示
src/input.ts       自然语言入口与资料快照
src/config.ts      模型、工具目录与执行时限
src/contracts.ts   Agent 定义、计划、结果、记录
src/bundle.ts      模型返回的解析与契约校验
src/generator.ts   生成 Agent 与提示词
src/execution.ts   按生成的步骤、依赖和修订策略执行
src/agent.ts       SDK 创建、等待、读取结果与关闭
src/records.ts     记录、轨迹、资产状态与 WM 读回
src/context.ts     选择领域资料、人工/自动经验与经历
src/rsi-main.ts    RSI 入口，一次选择来源运行
src/rsi/           复盘、评估、确定性选择、版本与经验发布
src/validation.ts  订单结果与工具证据的客观检查
knowledge/         可维护的领域资料和人工经验
resources/         随包的真实任务工具及经历索引脚本
examples/          三份订单验收材料及 RSI 用例清单
src/task-package.ts 自动打包生成的任务
src/task-main.ts   任务包独立执行入口
src/run.ts        两种运行入口共用的执行流程
src/files.ts      SDK 终端工具的文件导出操作
tests/             契约和真实执行器的自动测试
scripts/           模板构建配套脚本
manifest.toml      Manus 包配置
```

固定执行器负责解释方案，生成方案决定实际业务流程。`AgentDefinition.id` 引用角色定义，SDK 的 `agent_id` 标识实际运行实例。生成器和任务 Agent 的调用共用一个 SDK 适配模块。

RSI 复用现有生成器与执行器。内层修改任务 Agent 定义和步骤；外层修改生成策略，再生成新任务资产进行对照。只有固定客观检查通过且修复失败或降低 Agent 调用数时才采用。

## 产物与复用

每次生成在 `artifacts/manus/assets/<assetId>/` 保存 `asset.json`、`original-request.json`、`original-input.json`、`dependencies.json`、`asset-state.json` 和 `task.poa`。每次执行在 `artifacts/manus/runs/<runId>/` 保存输入快照、所选上下文、工具回执、报告、客观验收、记录、轨迹及 WM 读回副本。

将 TUI 显示的任务包路径用于新的 `/poa fg <任务包路径>`，即可直接执行保存的任务定义与方案。包可以复制到独立目录运行，不需要 Manus 源码或 node_modules；运行环境需要 Brainary、模型配置和 Node.js。

`task.poa` 使用包内原请求与资料快照，无需输入，也不因环境中残留的新请求而改变任务。用 `node scripts/check-run.mjs <运行目录> [原生成运行目录]` 核对客观结果、工具证据、资产一致、新实例与零次生成调用。此前导出的包包含当时的执行器，使用新行为需重新运行更新后的 Manus 生成任务包。

Manus 包会生成新资产及 task.poa；任务包只执行已有资产，保存本次业务结果、运行记录和资产状态，不再导出新包。两者都执行结果检查；角色/实例数量与检查规范见设计文档第 10—11 节。

经历索引默认使用当前 `artifacts/manus`；跨目录共享可设置 `MANUS_MEMORY_ROOT`，启动 Brainary 时同时用 `--add-dir <记忆根目录>` 允许更新共享索引。用 `MANUS_EXPERIENCE_FILE` 指向人工维护的经验 JSON，实际读取的来源、版本和内容会写入 `context.json`。V2 将已通过对照的自动经验和生成策略保存在 `<memoryRoot>/learning/state.json`，后续 Manus 生成时按场景读取并记录实际版本。

## 运行 V2 RSI

```text
/poa fg /Users/notyourkay/Manus-brainary/dist/manus-rsi.poa
```

输入一个已有订单运行目录 `.../runs/<runId>`。RSI 读取真实执行记录，提出内外层候选，完成八次对照运行，导出 `rsi/<cycleId>/selected/task.poa` 并显示采用或保留的原因。新包仍直接重跑原任务。原资产保持不变；选中的生成策略作用于下一次 Manus 生成。

```bash
node scripts/prepare-rsi-demo.mjs
node scripts/check-rsi.mjs <实验目录>
```

准备脚本创建隔离环境和明确标注的人工两步旧策略，便于真实展示冗余步骤被合并的收益。核查脚本从实际报告、工具回执、输入、上下文与调用轨迹重新检查结果和选择，不只读取汇总结论。普通文本生成仍可使用；当前自动 RSI 验收范围是具有固定客观检查器的订单结算任务。完整操作见 V2 手册。
