# 第一阶段开发自测记录

日期：2026-11-11。状态：开发自测完成，人工签收待用户执行。

## 验证环境

- Brainary、PoA SDK、WM SDK：0.2.0-rc。
- TUI 宿主：custom / gpt-5.5；程序创建的 Agent：custom / gpt-5.6-sol。
- 本机 Node.js 26.8.2、pnpm 12.14.0，依赖沿用模板锁文件。
- 未修改 SDK 或 Runtime；宿主模型选择差异已整理反馈材料。

## 真实运行

以下均调用真实模型。每个运行目录都保存 record.json、trace.jsonl 和 WM 读回快照；成功运行另保存 result.md。

| run ID | 模式 / 状态 | 完成步骤 | 请求 Agent 次数 | 生成次数 | 轨迹事件 |
| --- | --- | --- | --- | --- | --- |
| `28502b5e-9324-4d90-91e7-baffe307e077` | generate / completed | 2 | 5 | 1 | 30 |
| `e8f971f2-412e-45ed-8609-7b747a6f84f6` | generate / completed | 1 | 3 | 1 | 19 |
| `d9d5e8c6-7a56-43df-a695-db3c144d7bf2` | replay / completed | 2 | 4 | 0 | 25 |
| `69e2c2c3-cb1d-4ad8-a13d-2c95d1041d6a` | replay / error | 0 | 1 | 0 | 5 |

运行目录均位于本仓库 `artifacts/manus/runs/<run ID>/`。最后一行是刻意使用不兼容宿主模型的负向测试：SDK 创建失败，未产生运行实例和成功结果文件；5 条轨迹保留了开始、资产复用、步骤、Agent 请求及错误。

### 会议任务

通过 TUI 的 ask 提交人工手册中的会议样例，要求先提取事实，最终表格包含接口清单、联调、测试三项。真实生成了一个任务角色、两个步骤，并按依赖传递提取结果。结果保留张敏/周三前、李雷/接口清单依赖，将测试负责人和时间标为待确认，未补充具体日期或负责人。

对应资产：`b584af30-4b47-4a21-93a5-73b54eea51a5`。生成运行用时约 53.3 秒（从接收任务后建立运行记录到结束，不含用户输入等待）。TUI 已观察到 Script completed、角色/步骤摘要、任务包路径、记录路径及最终表格。

### 简单任务

输入：把“周一完成初稿，周二内部评审，周三提交终稿”转为 day/task 字符串字段的 JSON 数组，只输出 JSON。

真实生成一步方案，结果解析后与以下数据完全一致：

```json
[{"day":"周一","task":"完成初稿"},{"day":"周二","task":"内部评审"},{"day":"周三","task":"提交终稿"}]
```

对应资产：`7f494d35-d3ad-449d-af2b-fa6a6ffaf127`。运行约 29.1 秒；TUI 显示最终 JSON 和资产路径。

### 独立复用

只复制会议任务的 task.poa 到独立临时目录，目录内没有 Manus 源码或 node_modules。在新的 Brainary TUI 会话中启动复制后的包，不重新输入任务。

原执行目录：`/var/folders/dx/pztn0zqj1jj2pdkd5t2_3l240000gn/T/manus-reuse-xl9lqi5u`。

复用运行保持同一 asset ID、Agent 定义与步骤方案，分配新的 run ID 和执行实例。调用四个实例（两次任务执行、两次结果检查），生成 Agent 调用为零。约 37.4 秒完成，TUI 显示最终表格。原生成记录保留，复用证据已复制回本仓库的 artifacts 目录便于验收。

## 留痕与错误验证

- 所有成功样例的 WM read_data 结果与 record.json 完全一致。
- trace.jsonl 保存原始生成回复、各次调用的完整定义与输入、实例 ID、输出、检查反馈及时间。
- 不兼容宿主模型的实际 SDK 错误产生 status=error，保存原始错误和已有轨迹，WM 快照仍与错误记录一致，未生成假的 result.md。
- 当前真实成功样例均未触发修订；业务检查不通过后的修订与停止由真实执行器的确定性测试覆盖。

## 自动检查

- pnpm lint、pnpm typecheck、pnpm test、pnpm package 通过。
- 3 个测试文件、12 项测试，覆盖生成契约、执行依赖、角色变化、修订/失败停止、任务包的代码与数据装载。
- scripts/check-run.mjs 对原生成运行、简单任务与独立复用运行均返回 verified=true；复用检查同时核对零次生成、新实例和方案一致性。

## 构建资产

- Manus：`dist/manus.poa`，SHA-256：`b1713a3d3f0959b811ef55cb32d5cd771e19757e10f6e9ef30c61baeefa24e29`。
- 会议任务：`artifacts/manus/assets/b584af30-4b47-4a21-93a5-73b54eea51a5/task.poa`，SHA-256：`70fd53ea075cfbc907844aee20ff657d2e65b10a3423d9f63ba0bc8fb9fe7a76`。
- 任务包包含 main.js、manifest.toml、asset.json，运行依赖 SDK 已捆绑。

构建产物与运行数据未提交 Git，源码、手册、核查脚本和本记录已纳入仓库。用户可直接使用本机产物验收，也可以从源码重新构建和生成。

## 联调中的两个选择

1. TUI 使用 gpt-5.5 作为宿主，让 rc SDK 对应的 V1 Agent 工具可用。实际任务模型保持 gpt-5.6-sol。反馈材料见 `docs/feedback/2026-11-11-agent-tool-selection.md`。
2. 通过 Runtime 支持的 @exec pragma 延长前台等待窗口。未设置时长任务会先返回 Script running；设置后已在 31 秒的最小样例及真实 Manus/任务包中验证最终输出返回。Manus 的窗口为 15 分钟，任务包窗口按方案的最大 Agent 调用次数与配置时限计算。

## 人工交接

按 `docs/acceptance/phase-1.md` 的 H1—H5 执行，填写人工结论。当前停在第一阶段，不启动第二阶段 RSI。
