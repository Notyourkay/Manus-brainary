# Manus on Brainary

Manus 根据用户任务生成任务 Agent 与执行方案，通过 Brainary SDK 创建实例并执行。主交付物是 `dist/manus.poa`，在 Brainary TUI 前台运行。

V1 支持理解自然语言新任务的 Agent 包、真实工具、简化领域本体、经历查询与人工经验读取。任务方法与每次材料分开，资产分别记录生成、执行、客观验证和人工签收状态。订单 CSV 结算核对是完整验收场景。V1 阶段已完成，标签为 `v1-complete`；第二阶段 RSI 尚未开始。验收操作、自测摘要和证据路径集中在人工验收手册。

当前 `codex/task-reuse-ux` 分支优化复用入口：`task.poa` 直接重跑原任务，`task-new.poa` 在 TUI 显示用途并接收一句新请求。两个入口属于同一资产。优化验收后再合入 main；V2 后续从 main 单独建立 `codex/v2-rsi`。

## 开发依据

- [人工验收手册](docs/acceptance/phase-1.md)：H1—H7 的操作、指标、预期结果和签收表。
- [设计文档](docs/design/manus-demo-v1.md)：定位、展示形式、架构、数据契约、执行语义与验收。
- [实施计划](docs/plans/manus-demo-v1.md)：开发任务、接口和验收步骤。
- [开发规范](AGENTS.md)：用户指定的通用工程规则。
- [V2 目标](docs/design/manus-demo-v2-target.md)：后续 RSI 的改进对象与边界。

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
- `dist/manus.poa`：可分发的 Manus 程序包。

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

生成完成后，TUI 会给出两条可复制的命令：运行 `task.poa` 直接重跑；运行 `task-new.poa` 后直接输入本次自然语言任务。日常复用无需准备 JSON 或环境变量。编程调用仍可通过 POA_INPUT 或 MANUS_INPUT_FILE 传入字符串或 `{ "request": "完整任务描述" }`。

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
src/context.ts     选择领域资料、人工经验与经历
src/validation.ts  订单结果与工具证据的客观检查
knowledge/         可维护的领域资料和人工经验
resources/         随包的真实任务工具及经历索引脚本
examples/          两份不同的订单验收材料
src/task-package.ts 自动打包生成的任务
src/task-main.ts   任务包独立执行入口
src/run.ts        两种运行入口共用的执行流程
src/files.ts      SDK 终端工具的文件导出操作
tests/             契约和真实执行器的自动测试
scripts/           模板构建配套脚本
manifest.toml      Manus 包配置
```

固定执行器负责解释方案，生成方案决定实际业务流程。`AgentDefinition.id` 引用角色定义，SDK 的 `agent_id` 标识实际运行实例。生成器和任务 Agent 的调用共用一个 SDK 适配模块。

第一阶段已完成生成与执行闭环、记录持久化及独立任务包导出。第二阶段使用这些记录实现 RSI。

## 产物与复用

每次生成在 `artifacts/manus/assets/<assetId>/` 保存 `asset.json`、`original-request.json`、`original-input.json`、`dependencies.json`、`asset-state.json`、`task.poa` 和 `task-new.poa`。每次执行在 `artifacts/manus/runs/<runId>/` 保存输入快照、所选上下文、工具回执、报告、客观验收、记录、轨迹及 WM 读回副本。

将 TUI 显示的任务包路径用于新的 `/poa fg <任务包路径>`，即可直接执行保存的任务定义与方案。包可以复制到独立目录运行，不需要 Manus 源码或 node_modules；运行环境需要 Brainary、模型配置和 Node.js。

`task.poa` 默认直接重跑原任务，无需输入；`task-new.poa` 询问一次本次任务，已有任务 Agent 理解请求并调用工具，定义与方案保持不变。新入口输入“取消”或提交空答案会结束，按 Esc 可由 TUI 中断，不执行原任务。两个包各自可独立复制运行。用 `node scripts/check-run.mjs <运行目录> [原生成运行目录]` 核对客观结果、工具证据、资产一致、新实例与零次生成调用。

Manus 包会生成新资产及两个任务入口；任务包只执行已有资产，保存本次业务结果、运行记录和资产状态，不再导出新包。两者都执行结果检查；角色/实例数量与检查规范见设计文档第 10—11 节。

经历索引默认使用当前 `artifacts/manus`；跨目录共享可设置 `MANUS_MEMORY_ROOT`，启动 Brainary 时同时用 `--add-dir <记忆根目录>` 允许更新共享索引。用 `MANUS_EXPERIENCE_FILE` 指向人工维护的经验 JSON，实际读取的来源、版本和内容会写入 `context.json`。自动经验提炼和 RSI 留在 V2。
