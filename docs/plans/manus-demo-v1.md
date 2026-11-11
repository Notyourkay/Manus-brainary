# Manus Demo V1 实施计划与验收契约

日期：2026-11-11
设计依据：`docs/design/manus-demo-v1.md`
状态：任务 1—5 的开发与自测完成，人工验收待用户执行；第二阶段未开始。

第一阶段目标：在 TUI 运行 Manus，输入自然语言，自动生成完整任务 PoA 与 Agent 定义，执行并保存结果和轨迹，在新的 Brainary 会话中直接复用任务包。

## 开发约定

- 遵循 `AGENTS.md`，使用 Brainary、PoA SDK、WM SDK `0.2.0-rc`。
- 沿用 TypeScript、Vitest、Biome、Rolldown 和模板打包依赖。
- 外部数据在入口校验，模块间传递契约类型。
- 任务 1—5 属于同一个第一阶段，开发完成后停下来交由用户验收。
- 人工操作手册统一在 `docs/acceptance/phase-1.md`，开发证据在 `docs/research/2026-11-11-phase-1-verification.md`。

## 任务 1：工程与执行契约

范围：`src/contracts.ts`、`bundle.ts`、`execution.ts`，模板配置与测试。

输入/输出：`parseBundle(raw, availableTools)` 将模型回复变为 `GeneratedBundle`；`executeBundle(task, bundle, runAgent, onStep, trace)` 按生成方案返回 `ExecutionResult`。

- [x] 继承模板工具链并固定 rc SDK 依赖，构建 `dist/manus.poa`。
- [x] 分开表达 Agent 定义、方案中的定义引用和 Runtime 实例 ID。
- [x] 实现生成数据入口校验和前置结果传递。
- [x] 实现检查、有限修订和失败停止。
- [x] 运行静态检查、执行器与契约测试、构建打包。

### 人工验收契约 H1：工程可运行

操作：按手册第 1 节安装与构建，启动 TUI 并运行 Manus。

指标：lint、typecheck、test、package 均成功；包存在且能显示自由文本输入框。

预期：没有初始化错误，用户可以输入自己的任务。

证据：检查输出、包路径、TUI 输入框。人工结论由手册签收表记录。

## 任务 2：真实模型联调与 TUI 展示

范围：`src/main.ts`、`input.ts`、`config.ts`、`generator.ts`、`agent.ts`、`run.ts`。

接口：`readTask(): Promise<TaskRequest>`；`createAgentRunner(config, trace): AgentRunner`；`generateBundle(task, config, runAgent): Promise<GeneratedBundle>`。

- [x] 在真实 TUI 前台用 ask 接收自然语言。
- [x] 验证创建、执行、等待、关闭真实 Agent 的完整调用。
- [x] 展示角色、步骤、任务包路径、最终结果和记录路径。
- [x] 验证会议任务生成两步方案，简单 JSON 任务生成一步方案。
- [x] 在构建产物设置 Runtime 支持的执行等待参数，使较长任务的最终输出正常返回 TUI。
- [x] 记录 rc 的宿主启动条件：`brainary -m gpt-5.5`，实际任务 Agent 仍用 `gpt-5.6-sol`。

### 人工验收契约 H2：自然语言生成与执行

操作：按手册第 2 节提交会议样例，再提交一条自己的自包含文本任务。

指标：可查看角色定义、步骤依赖和验收条件；真实实例 ID、步骤执行记录与最终结果可以关联。

预期：流程来自生成方案，界面最终显示方案摘要、资产路径与结果。简单任务允许只生成一个 Agent、一个步骤。

证据：两次运行目录、生成产物、TUI 最终输出。

## 任务 3：文本场景正确性与失败语义

范围：真实会议/JSON 样例、`tests/execution.test.ts`、`scripts/check-run.mjs`。

本阶段以自包含文本任务验收，工具目录为空。业务工具场景在用户确定后另行扩展。

- [x] 给出明确输入和客观检查条件，逐项核对会议任务中的事实与未知项。
- [x] 将 JSON 结果解析后与三条预期数据逐项比较。
- [x] 用真实执行器测试依赖传递、修订反馈和失败停止；只替换模型回复边界。
- [x] 用真实 Runtime 的不兼容宿主配置触发 SDK 错误，验证错误状态、轨迹和 WM 快照保存，且没有成功结果文件。
- [x] 保存模型审查结果，同时用独立核查确认样例内容与记录一致性。

### 人工验收契约 H3：结果可客观核查

操作：按手册第 3 节核对事实、表格和待确认项，运行固定失败用例；按第 4 节核查运行记录。

指标：必需事实完整、未知字段未被补成事实、输出格式正确；检查失败后修订次数受方案限制，下游不继续执行。

预期：成功任务得到符合要求的结果，失败有明确状态和证据。本轮真实成功样例没有触发修订，修订和业务检查失败分支由执行器测试覆盖；真实 SDK 错误留痕另有运行证据。

证据：result.md、record.json、trace.jsonl，以及执行器测试结果。

## 任务 4：运行资产与轨迹留痕

范围：`src/records.ts`、`files.ts`，主入口和执行入口中的记录接线。

接口：`RunJournal.open(task, config, asset?)` 创建本次记录；`trace(event)` 追加轨迹；`save()` 保存记录并使用 WM SDK 写入/读回快照；`fail(error)` 保存错误结论。

- [x] 分配独立 asset ID 与 run ID，区分生成与复用运行。
- [x] 记录任务、配置、生成器/执行器版本、时间、状态、结果和错误。
- [x] 保存生成原文、Agent 定义、每次调用输入输出、实例 ID、检查与修订事件。
- [x] 使用 SDK 注册、写入并读回当前 WM 状态，导出读回快照。
- [x] 生成后先保存定义与任务包，再进入任务执行。
- [x] 验证关闭会话后文件可读，WM 快照与保存的运行记录一致。

### 人工验收契约 H4：轨迹与产物可追溯

操作：按手册第 4 节查看资产/运行目录，执行 `node scripts/check-run.mjs <运行目录>`，关闭会话后重新打开文件。

指标：任务、原始生成回复、定义、方案、调用输入输出、检查、时间、状态和版本可关联；核查命令返回 `verified: true`。

预期：资产和每次运行独立保存；record.json 与 WM 读回快照一致；错误运行保留已发生的轨迹。

证据：asset.json、record.json、trace.jsonl、wm-snapshot.json、result.md。

## 任务 5：自动导出与独立任务包复用

范围：`src/task-package.ts`、`task-main.ts`、`run.ts`、`rolldown.config.mjs`、任务包测试。

接口：`buildTaskArchive(asset, program)` 构建独立包；`exportTaskPackage(asset, program, directory)` 在 Manus 运行时输出 task.poa；`executeAsset(asset, journal)` 为初次执行与复用入口提供同一执行逻辑。

- [x] 构建 Manus 时捆绑任务运行入口，运行时把已校验的定义、方案和任务组合成完整 `.poa`。
- [x] 自动输出 task.poa，用户无需手动再执行导出脚本。
- [x] 包含 main.js、manifest.toml 和 asset.json，不依赖 Manus 源码与 node_modules。
- [x] 把包复制到独立目录，在新的 TUI 会话中直接运行。
- [x] 验证资产与方案一致、新 run ID、新实例 ID、零次生成 Agent 调用，原记录保留。
- [x] 保存独立重跑的结果与轨迹，并核对任务结果。

第一版复用执行原任务。同类新任务的参数化作为后续需求处理。

### 人工验收契约 H5：任务资产独立复用

操作：按手册第 5 节在新会话启动生成的任务 `.poa`，再执行 `node scripts/check-run.mjs <复用运行目录> <原生成运行目录>`。

指标：`generatorCalls` 为 0；资产、定义与方案一致；run ID 和执行实例更新；任务结果通过检查。

预期：无需重新生成方案或提供 Manus 源码，任务包直接执行保存的任务并单独留痕。运行环境需要 Brainary、模型配置及用于文件导出的 Node.js。

证据：任务包、原运行与复用运行记录、最终结果。

## 第二阶段入口：RSI

本轮到此停止，等待用户完成第一阶段人工验收。

第二阶段再确定改进对象、固定验收集和度量，实现候选改进、对照执行、效果比较与版本选择。

### 第二阶段人工验收契约（本轮不实施）

在相同验收集上运行原版本与候选版本，检查效果、成本与失败率数据，以及版本选择依据。详细操作手册随第二阶段设计确定，不把第一阶段的一次任务修订作为 RSI 验收结果。
