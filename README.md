# Manus on Brainary

Manus 根据用户任务生成任务 Agent 与执行方案，通过 Brainary SDK 创建实例并执行。主交付物是 `dist/manus.poa`，在 Brainary TUI 前台运行。

当前为第一版代码骨架：已接入输入、生成契约、方案执行、检查与有限修订的源码；通过静态检查、11 项自动测试和打包验证。真实模型闭环、业务场景、持久化与任务包导出按实施计划推进。

## 开发依据

- [设计文档](docs/design/manus-demo-v1.md)：定位、展示形式、架构、数据契约、执行语义与验收。
- [实施计划](docs/plans/manus-demo-v1.md)：开发任务、接口和验收步骤。
- [开发规范](AGENTS.md)：用户指定的通用工程规则。
- [接入记录](docs/research/2026-11-11-demo-readiness.md)：rc SDK 与 TUI 输入验证证据。

采用轻量 SDD：以设计与契约指导开发，按可运行的小步骤实现、验证和同步文档。工具链沿用 `brainary-poa-template`。

## 安装与构建

使用 Node.js 22.12+ 的 22.x、24.x 或 26+，pnpm `12.14.0`。SDK 固定为 `0.2.0-rc`，安装时沿用锁文件。

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
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

随后通过 `ask` 输入任务。程序依次展示生成的定义与方案、步骤检查结果和最终运行记录。

当前 `src/config.ts` 使用本机已有的 `custom / gpt-5.6-sol` 模型配置，默认工具列表为空，先用自包含文本任务联调。模型凭据由 Brainary 管理。确定业务场景后补充实际工具清单。

`brainary exec --poa` 属于非交互入口，无法回答 `ask`；当前主运行方式为上述 TUI 前台命令。

## 代码骨架

```text
src/main.ts        串起输入、生成、执行与展示
src/input.ts       ask 输入边界
src/config.ts      模型、工具目录与执行时限
src/contracts.ts   Agent 定义、计划、结果、记录
src/bundle.ts      模型返回的解析与契约校验
src/generator.ts   生成 Agent 与提示词
src/execution.ts   按生成的步骤、依赖和修订策略执行
src/agent.ts       SDK 创建、等待、读取结果与关闭
tests/             契约和真实执行器的自动测试
scripts/           模板构建配套脚本
manifest.toml      Manus 包配置
```

固定执行器负责解释方案，生成方案决定实际业务流程。`AgentDefinition.id` 引用角色定义，SDK 的 `agent_id` 标识实际运行实例。生成器和任务 Agent 的调用共用一个 SDK 适配模块。

第一阶段先交付生成与执行闭环，再补齐记录持久化及独立任务包导出。第二阶段使用这些记录实现 RSI。
