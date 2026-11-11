# Manus Demo 开发决策与接入记录

更新日期：2026-11-11，Asia/Shanghai。
当前阶段：第一阶段开发与自测完成，等待人工验收；本文保留前期接入证据。最新验证见 `docs/research/2026-11-11-phase-1-verification.md`。
当前架构以 `docs/design/manus-demo-v1.md` 为准，实施计划见 `docs/plans/manus-demo-v1.md`。

## 已确定的范围

- Manus 根据需求生成执行任务的 Agent；PoA 是组织 Agent 与工具调用的程序。Agent 配置、运行实例与编排程序分别描述。
- 第一阶段完成 Manus 生成：至少生成角色/知识/工具等配置，以及执行步骤、依赖、检查与纠错策略；希望同时形成可运行程序。执行方案需要实际控制任务执行，不能只替换固定流程中的提示词。
- 第二阶段完成 RSI，根据执行反馈改进任务执行方法和生成方法，并验证效果。
- 开发在 `/Users/notyourkay/Manus-brainary` 进行，以本地 `brainary-poa-template` 为工程起点，使用 Brainary 0.2.0-rc 和对应 SDK。
- 用户暂缓确定任务场景。当前先确定输入与生成方式，场景和样例随后补充。
- 开发规范统一维护在仓库根目录 `AGENTS.md`。

## 开发与运行关系

在 Manus 仓库中使用模板的 TS/JS、检查和打包流程，调用 SDK 编写业务程序，构建为 `.poa` 后交给 Brainary 0.2.0-rc 运行。运行包也用于开发联调，Manus 不承担 SDK、WM 或 Rust 框架的开发。

| 项目 | 当前采用的版本或位置 |
| --- | --- |
| 模板 | `/Users/notyourkay/brainary-poa-template`，保留本地已调整的 rc 依赖 |
| SDK | `@brainary/poa-sdk`、`@brainary/wm-sdk` 均为 `0.2.0-rc` |
| Runtime | `/Users/notyourkay/brainary-rc-0.2.0/bin/brainary`；来源提交 `f7cb5106fe3c126ee0a48549a472b7956440269f` |
| Node | `v26.8.2` |
| pnpm | 已对齐为 `12.14.0`，当前命令解析到 `/Users/notyourkay/miniforge3/bin/pnpm` |

`brainary --version` 当前返回 `0.2.0-rc`。模型配置与密钥环境变量已有，无需另外建立输入服务或重建运行环境。

## D-01：首版通过前台 ask 接收任务

选择：用户打开 Brainary TUI，在前台运行 Manus PoA；程序开始时调用 SDK 的 `ask`，以自由文本问题接收任务。用户提交后，同一次 PoA 执行继续进入 Manus 的生成流程。

```text
启动 Brainary TUI
→ /poa fg <构建后的 Manus.poa 的路径>
→ ask：请描述任务及期望输出
→ 用户输入自然语言任务
→ 入口一次性校验任务输入
→ 外层 Agent 生成任务 Agent 与执行方案
→ 运行并检查生成产物
```

`ask` 不要求提前提供选择项；不传 options 即可接收自由文本。SDK 的回答通过 `answers[i].text` 返回，不会自动写入 `POA_INPUT`，入口将收到的文本作为业务参数传给后续流程。

这条路径复用 Brainary 已有交互，适合首版现场演示。后续确实需要批量或无人值守执行时，再增加相应的程序化输入方式。

### 0.2.0-rc 实测

使用现有官方示例 `/Users/notyourkay/brainary-codex/workflow-demos/poas/01_ask`，未修改示例源码。

| 启动方式 | 实际结果 |
| --- | --- |
| TUI 中 `/poa fg <示例目录>` | 弹出问题；自由文本提交后，程序收到完整文本并继续完成 |
| `brainary exec --poa <示例目录>` | 返回 `unavailable / nonInteractive`；不显示问答框 |

前台实测输入 `MANUS_TASK_INPUT_OK：比较两份本地文档并输出差异。`，示例最终输出的 `note` 字段与输入完全一致。测试使用隔离的临时配置和本机不可用的模型端点，示例本身未调用模型；验证的是实际 TUI → ask → PoA 返回链路。

前台运行 ID：`01a5e3a7-d67a-415e-96b8-015dcd78d431`。临时运行目录：`/tmp/manus-ask-check-lypdsro_`。已退出测试 TUI。

此前 `--poa` 与普通 prompt 冲突、stdin 未传入 `POA_INPUT` 的观察仍成立，但不再是首版的输入阻塞，也无需为此先改 CLI。

## D-02：按应用开发边界使用 SDK

- 版本、路径等普通环境问题直接处理，只记录最终选用版本。
- WM、Agent 与模型按当前 SDK 接入，联调随 Manus 开发推进，不另设一轮框架能力审计作为开工条件。
- 出现实际 SDK 缺陷或必需能力缺口时，记录版本、最小复现、实际/预期行为和影响，反馈对应负责人修复；不在 Manus 中重写 WM 或扩展 SDK。
- SDK 的 Agent 结果目前以文本返回。模型返回的外部数据在接入处完成解析和一次校验，之后传递已确定类型的值。
- SDK 的 `PoA` 类当前提供记忆接口，不能把该类误解为任务编排程序、运行中的 Agent 或通用程序启动器。

## 已落实到设计的选择

选择结构化方案驱动固定执行器，生成内容包括 Agent 定义、执行步骤、前置结果引用、验收条件与修订次数。第一阶段 A 运行 `manus.poa` 完成闭环，第一阶段 B 接入持久化并导出独立任务包。自由生成 JS 不作为首版骨架主路径。

第一阶段保留任务输入、生成产物和执行记录，服务于调试和复用。自动复盘、候选改进及收益比较在第二阶段实现。

## 代码骨架验证记录（2026-11-11）

- 已继承模板工具链、锁文件和 rc SDK 依赖，打包输出为 `dist/manus.poa`。
- TypeScript 检查、Biome 检查和 11 项 Vitest 测试通过，构建与打包成功。
- 测试使用真实生成结果解析器和方案执行器；模型调用边界提供固定回复，验证角色选择、依赖结果传递、修订反馈和失败停止。
- rc Runtime 加载包时发现 Ajv 默认 logger 依赖 `console`，V8 环境未提供该全局对象。已通过 Ajv 的 `logger: false` 配置解决，无需修改 Runtime 或 SDK。
- 修正后包成功加载、初始化并进入 `ask`。使用 `brainary exec --poa` 验证时返回预期的“请在 Brainary TUI 中使用 /poa fg”提示；本次验证未调用模型，也不代表交互生成与执行闭环已验收。
- 加载检查执行 ID：`d5478969-6bee-4767-a926-f79636975fd9`；线程 ID：`01a1c9b5-ec0f-7dd3-a4e2-5b28fae20c21`。
- WM 持久化、任务包导出与真实场景效果属于后续实现/联调，见实施计划。

## 参考

- `AGENTS.md`：用户指定的通用规则与项目开发边界。
- `/Users/notyourkay/brainary-poa-template/README.md`、`package.json`：开发、构建和依赖。
- 模板安装目录 `node_modules/@brainary/poa-sdk/dist/io.d.ts`、`types/io.d.ts`：ask 的实际发布接口。
- `/Users/notyourkay/brainary-codex/workflow-demos/poas/01_ask/README.md`、`main.js`：本轮使用的官方交互示例。
- `/Users/notyourkay/brainary-rc-0.2.0/BUILD_INFO.json`：实际运行包来源。
