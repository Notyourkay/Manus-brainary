# Manus V2 人工验收手册

更新：2026-11-13。开发分支 `codex/v2-rsi`。本手册对应 V2-H1—H5，记录操作、预期和实际证据；人工签收由用户完成。

## 1. 展示内容

`manus.poa` 生成并执行任务 Agent。`manus-rsi.poa` 对一个已有订单运行进行一轮复盘，分别改进任务 Agent/方案和生成策略，真实运行基线与候选，再决定采用或保留。输出的 `selected/task.poa` 继续无需输入地重跑原任务。

本轮用订单结算验证完整 RSI：同一轮中有四次内层执行和四次外层生成执行。外层的 C 材料未提供给复盘 Agent。普通文本任务仍可生成，但 V2 自动选择的验收范围是具有固定客观检查器的订单结算。

## 2. 构建

```bash
cd /Users/notyourkay/Manus-brainary
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm package
```

应生成 `dist/manus.poa` 和 `dist/manus-rsi.poa`。沿用 Brainary 0.2.0-rc 默认配置，任务 Agent 模型为 `gpt-5.6-sol`/`custom`。凭据由 Brainary 管理。

## 3. 准备演示与生成基线

```bash
node scripts/prepare-rsi-demo.mjs
```

脚本打印工作目录、环境变量和 Brainary 启动命令，照打印内容执行。它会创建独立的 `.local/rsi-demo-<时间戳>/`，内含：

| 文件 | 用途 |
| --- | --- |
| request.json | 完整自然语言订单核对请求，指向 examples/orders-a.csv |
| artifacts/manus/learning/state.json | 明确标注为人工编写的两步旧策略 |
| demo.json | 这次演示的目录、配置与旧策略来源 |

两步旧策略要求“先整理规则，再调用工具对账”。它用于展示减少冗余步骤的收益，不包含伪造的运行、失败或指标。标准配置若已生成一步方案，RSI 也可以正确保留基线。

在新 TUI 中运行：

```text
/poa fg /Users/notyourkay/Manus-brainary/dist/manus.poa
```

准备脚本通过 `MANUS_INPUT_FILE` 提供自然语言请求，因此这次演示无需再输入任务。日常使用不设置此变量时，Manus 正常询问任务描述。

应得到两步方案、真实 read/write 回执及 13 项通过的客观检查；A 材料净额为 14000 分。记下输出的 **运行目录** `.../runs/<runId>` 和任务包路径。

在另一个普通终端核查：

```bash
cd /Users/notyourkay/Manus-brainary
node scripts/check-run.mjs <基线运行目录>
```

预期 `verified: true`，一次生成调用，通常共五次 Agent 调用（生成一次，两个任务步骤各执行和检查一次），两次业务工具调用。

## 4. 启动并检查一轮 RSI

在刚才的 TUI 中运行：

```text
/poa fg /Users/notyourkay/Manus-brainary/dist/manus-rsi.poa
```

它只询问一次来源运行目录，填入上一节的 `.../runs/<runId>`。不要填 `assets/<assetId>` 或 task.poa 路径。联调也可在启动 Brainary 前设置 `MANUS_RSI_SOURCE=<运行目录>`，此时跳过询问；它与 Manus 的任务输入独立。

TUI 依次显示复盘和 `inner/outer`、`baseline/candidate`、用例 ID。运行时间取决于模型响应。结束时显示通过数、Agent 调用数、采用/保留原因、选中包路径与实验目录 `.../rsi/<cycleId>`。

正常的两步到一步改进应出现：

| 对照 | 基线 | 候选 | 采用条件 |
| --- | --- | --- | --- |
| 内层 source/B | 2/2 通过，通常 8 次 Agent 调用 | 2/2 通过，通常 4 次调用 | 每个用例调用不增加且总调用减少 |
| 外层 B/C | 2/2 通过，通常 10 次 Agent 调用 | 2/2 通过，通常 6 次调用 | 同上，调用数包含实际生成 |

每个用例都要通过固定的 13 项客观检查。实际重试也计入调用数；模型结果有变化时以真实证据为准。修复基线失败且候选全通过也可采用；平局、退化或条件不一致保留基线。耗时只展示，不据此判定收益。

```bash
node scripts/check-rsi.mjs <实验目录>
```

预期 `verified: true`。核查器会重新读取八个运行的报告、工具回执、输入、上下文和轨迹，重算客观结果与选择，并检查原资产未被改写。

人工核对这些文件：

| 位置 | 应看到的内容 |
| --- | --- |
| source.json | 真实来源记录、Agent 定义、工具回执及原文件哈希 |
| cases.json / context.json | 冻结的用例、材料哈希和双方共用上下文 |
| reflection-raw.txt / reflection.json | 模型原文、问题诊断、真实 sourceRunIds、经验候选与两种改进 |
| inner-candidate.json | 新 assetId、parentAssetId、cycleId，具体 Agent 与步骤变化 |
| outer-candidate.json | 新策略 ID、父版本和具体生成指令 |
| inner-comparison.json / outer-comparison.json | 每个实际 run 的质量、调用量、条件与选择理由 |
| result.json | 完成状态、发布状态、选中资产/策略、经验 ID、包路径 |
| selected/task.poa | 内嵌原请求与材料的选中任务包 |
| runs/<runId>/ | 每个评估的输入、报告、工具回执、客观检查、完整 trace 和 WM 读回 |

基线评估使用独立副本，避免不同材料写回原资产。保留基线时，选中包保留原 Agent 定义与步骤，但评估副本有自己的 assetId 和指向原资产的谱系。

可在临时副本中验证篡改检测：复制实验目录，修改副本 `inner-comparison.json` 中某候选的 `inputSha256`，对副本执行 `check-rsi`，应报“保存的指标必须与实际运行重新计算一致”并以非零状态退出。原证据目录保持不动。

## 5. 验证选中包独立运行

把 `result.json` 中的 `selectedPackage` 复制到一个新目录，在该目录启动新的 Brainary 会话，再执行复制后的 task.poa：

```bash
mkdir -p /tmp/manus-v2-replay
cp <选中包绝对路径> /tmp/manus-v2-replay/task.poa
cd /tmp/manus-v2-replay
/Users/notyourkay/brainary-rc-0.2.0/bin/brainary
```

```text
/poa fg /tmp/manus-v2-replay/task.poa
```

应直接重跑原任务，不询问任务、不生成新定义；为已有定义创建新 Agent 实例，实际 read/write，13 项检查通过。原 CSV 无需随包复制，使用包内快照。

```bash
cd /Users/notyourkay/Manus-brainary
node scripts/check-run.mjs <新重跑运行目录> <选中版本的source用例运行目录>
```

第二个参数来自内层 comparison 中选中一侧的 `caseId: source`。预期资产和定义相同、run ID 和实例不同、`generatorCalls: 0`。新包运行记录在新工作目录下。

## 6. 验证后续生成与保留基线

回到使用演示 `MANUS_MEMORY_ROOT` 的 TUI，再运行 `manus.poa`。它读取刚采用的外层策略和经验；若仍设置了准备脚本的 `MANUS_INPUT_FILE`，会再次执行 A 请求。

检查新运行的 `trace.jsonl` 中 `strategy_selected`、`record.json` / `asset.json` 的 `generationStrategy`：ID 应与上轮 `result.selectedStrategyId` 相同。`context.json` 应同时保留人工经验和发布的自动经验；自动经验有 applicability、version、来源运行、cycleId、支持它的评估运行和适用范围。未发布的候选不出现在后续上下文中。

再用这个已优化运行启动 `manus-rsi.poa`。当双方均为一步并通过时，调用数相同，应显示“保留基线”，`publishedExperienceIds` 为空，当前策略不变。若实际运行出现新的改善，则按同一规则采用；核对指标及原因即可。

## 7. 失败与重试

某次评估失败时保留其运行记录，仍计入对照；候选不能在未全通过时被采用。复盘格式错误时会携带校验反馈修正一次，原始回复和修正回复分别保留；仍然失败或出现证据收集等流程错误时写 `error.json`，标明阶段和原因，此轮不发布结果。排除具体原因后，从同一个来源运行启动新的一轮；原资产可继续运行。

## 8. 实测记录

本机证据根目录：`/Users/notyourkay/Manus-brainary/.local/v2-acceptance-20261113`。实现提交 `e6e5300`；lint、typecheck、36 个自动测试、package 均通过，构建包哈希保存在 `build-verification.json`。

| 验证项 | 实际结果 | 证据 |
| --- | --- | --- |
| 人工两步策略生成基线 | 13/13 通过；1 次生成，5 次总 Agent 调用，2 次工具调用 | runs/f38c0dc7-b00e-41b5-aaf8-28187117182f |
| 有收益的内层 RSI | 双方 2/2 通过；调用 8→4，采用候选 | rsi/f9cb227a-189c-46be-8040-199653f01b8f/inner-comparison.json |
| 有收益的外层 RSI | 双方 2/2 通过；调用 10→6，采用候选 | 同轮 outer-comparison.json |
| 新会话独立重跑 | 13/13 通过；0 次生成，2 次 Agent 调用，2 次工具调用 | standalone-replay/runs/0083d6db-4300-4e5c-8c18-0692068016ce |
| 新 Manus 会话读取改进 | 已采用策略和 2 条自动经验被读取；生成一步方案，13/13 通过，总调用 3 次 | runs/ed4941f5-527e-4cec-adee-19b87d450d2b |
| 证据篡改副本 | 分别改输入哈希、通过状态，检查器均以退出码 1 拒绝 | tamper-check.json |

表中 runs/、rsi/ 位于证据根目录下的 `artifacts/manus/`；standalone-replay/ 和 tamper-check.json 直接位于证据根目录。独立重跑实际工作目录是 `/private/tmp/manus-v2-replay.4LYqNO`，上表是持久保存的证据副本。

第一轮选中资产为 `15737267-cc87-4483-ac12-5d92425afb32`，选中策略为 `162a0803-3377-4788-9ef7-0c6532063326`，发布经验为同一 cycle ID 后缀 `-experience-1` 与 `-experience-2`。源 asset.json、原请求、原材料和 task.poa 的哈希均保持不变。内层候选的 `generationStrategy` 保留其最初生成来源；本轮改进通过 `lineage.cycleId` 追溯，当前外层策略查看 learning/state.json。

直接核查本机已完成的实验：

```bash
cd /Users/notyourkay/Manus-brainary
node scripts/check-rsi.mjs .local/v2-acceptance-20261113/artifacts/manus/rsi/f9cb227a-189c-46be-8040-199653f01b8f
node scripts/check-run.mjs .local/v2-acceptance-20261113/standalone-replay/runs/0083d6db-4300-4e5c-8c18-0692068016ce .local/v2-acceptance-20261113/artifacts/manus/runs/9f4ef2bc-743b-4d59-93cd-4e0550789a7d
node scripts/check-run.mjs .local/v2-acceptance-20261113/artifacts/manus/runs/ed4941f5-527e-4cec-adee-19b87d450d2b
```

联调中修复了完整轨迹经终端返回被截断、复盘输出误混入 Schema 字段、同一 PoA 重复注册 WM 声明三个问题。失败轮次保留 error.json；成功轮次采用字段精简的指标读取、至多一次格式修正和作用域内复用声明。完整轨迹始终保存在运行文件中。

无收益轮次 `68cc6c12-a34c-432d-aed0-fcb0ddc1cfda` 已完成：内层双方 2/2 通过、调用 4→4；外层双方 2/2 通过、调用 6→6，均保留基线，发布经验列表为空。原资产文件未变，learning/state.json 在本轮前后哈希完全一致；证据根目录的 `no-gain-check.json` 保存该核对结果。

```bash
node scripts/check-rsi.mjs .local/v2-acceptance-20261113/artifacts/manus/rsi/68cc6c12-a34c-432d-aed0-fcb0ddc1cfda
```

两轮完整实验共 16 次对照运行均由真实模型与工具完成，每次 13/13 客观检查通过，两个 check-rsi 命令均返回 verified: true。开发验证已完成，以下人工签收状态保留 pending。

## 9. 人工签收

| 契约 | 人工核对 | 状态 |
| --- | --- | --- |
| V2-H1 | 后续生成读取已发布策略/经验；来源、版本完整；人工经验共存 | pending |
| V2-H2 | 真实经历复盘、候选谱系、原资产文件不变 | pending |
| V2-H3 | 相同输入与条件，八次真实对照，选择可重算，篡改副本被拒绝 | pending |
| V2-H4 | 选中任务包在新会话直接执行；外层策略作用于后续生成 | pending |
| V2-H5 | 采用与保留分支、联调证据和操作可复现 | pending |

本分支完成后等待用户人工验收，不自动合并 main。
