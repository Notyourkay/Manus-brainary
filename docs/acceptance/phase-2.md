# Manus V2 人工验收手册

更新：2026-11-13。开发分支 `codex/v2-rsi`。本手册对应 V2-H1—H9，记录操作、预期和实际证据；人工签收由用户完成。

## 1. 展示内容

`manus.poa` 是统一入口。选择“执行新任务”生成并执行任务 Agent，结束后按元认知证据自动决定是否运行一轮 RSI；选择“复盘改进已有任务”则由内部 RSI 模块对已有订单运行进行一轮复盘，分别改进任务 Agent/方案和生成策略，真实运行基线与候选，再决定采用或保留。输出的 `selected/task.poa` 继续无需输入地重跑原任务。

本轮用订单结算验证完整 RSI：同一轮中有四次内层执行和四次外层生成执行。外层的 C 材料未提供给复盘 Agent。普通文本任务仍可生成，但 V2 自动选择的验收范围是具有固定客观检查器的订单结算。

## 2. 构建

```bash
cd /Users/notyourkay/Manus-brainary
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm package
```

应生成唯一的 Manus 应用包 `dist/manus.poa`；package 会清除旧的独立 RSI 构建产物。沿用 Brainary 0.2.0-rc 默认配置，任务 Agent 模型为 `gpt-5.6-sol`/`custom`。凭据由 Brainary 管理。

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

选择“执行新任务”，粘贴准备脚本打印的完整自然语言请求。相同请求也保存在 request.json 中。菜单中的另一项是“复盘改进已有任务”，两种操作都由同一 Manus 入口承接。

应得到两步方案、真实 read/write 回执及 13 项通过的客观检查；A 材料净额为 14000 分。记下输出的 **运行目录** `.../runs/<runId>` 和任务包路径。

在另一个普通终端核查：

```bash
cd /Users/notyourkay/Manus-brainary
node scripts/check-run.mjs <基线运行目录>
```

预期 `verified: true`，一次生成调用，通常共七次 Agent 调用（生成一次、方案/结束检查各一次、两个任务步骤各执行和检查一次），两次业务工具调用。

## 4. 自动 RSI 与主动复盘

若任务结束后按检查证据自动启动了 RSI，直接查看下方的进度和产物。也可在刚才的 TUI 中主动运行：

```text
/poa fg /Users/notyourkay/Manus-brainary/dist/manus.poa
```

选择“复盘改进已有任务”，再填入上一节的来源运行目录 `.../runs/<runId>`。不要填 `assets/<assetId>` 或 task.poa 路径。Manus 在同一次 PoA 执行中直接调用内部 RSI 模块。

脚本联调可用 POA_INPUT 或 MANUS_INPUT_FILE 提供 `{"action":"rsi","sourceDirectory":"/absolute/runs/run-id"}`，跳过菜单和目录询问。原有字符串或 `{"request":"自然语言任务"}` 继续直接进入生成流程。人工验收菜单时，启动 Brainary 前先 `unset MANUS_INPUT_FILE`，避免显式输入跳过菜单。

TUI 依次显示复盘和 `inner/outer`、`baseline/candidate`、用例 ID。运行时间取决于模型响应。结束时显示通过数、Agent 调用数、采用/保留原因、选中包路径与实验目录 `.../rsi/<cycleId>`。

正常的两步到一步改进应出现：

| 对照 | 基线 | 候选 | 采用条件 |
| --- | --- | --- | --- |
| 内层 source/B | 2/2 通过，通常 12 次 Agent 调用 | 2/2 通过，通常 8 次调用 | 每个用例调用不增加且总调用减少 |
| 外层 B/C | 2/2 通过，通常 14 次 Agent 调用 | 2/2 通过，通常 10 次调用 | 同上，调用数包含实际生成 |

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

回到使用演示 `MANUS_MEMORY_ROOT` 的 TUI，再运行 `manus.poa`，选择“执行新任务”并再次输入 A 请求。它读取刚采用的外层策略和经验。

检查新运行的 `trace.jsonl` 中 `strategy_selected`、`record.json` / `asset.json` 的 `generationStrategy`：ID 应与上轮 `result.selectedStrategyId` 相同。`context.json` 应同时保留人工经验和发布的自动经验；自动经验有 applicability、version、来源运行、cycleId、支持它的评估运行和适用范围。未发布的候选不出现在后续上下文中。

再次运行 `manus.poa`，选择“复盘改进已有任务”，填入这个已优化运行的目录。当双方均为一步并通过时，调用数相同，应显示“保留基线”，`publishedExperienceIds` 为空，当前策略不变。若实际运行出现新的改善，则按同一规则采用；核对指标及原因即可。

## 7. 失败与重试

某次评估失败时保留其运行记录，仍计入对照；候选不能在未全通过时被采用。复盘格式错误时会携带校验反馈修正一次，原始回复和修正回复分别保留；仍然失败或出现证据收集等流程错误时写 `error.json`，标明阶段和原因，此轮不发布结果。排除具体原因后，从同一个来源运行启动新的一轮；原资产可继续运行。

## 8. 实测记录

以下两轮为核心 RSI 的既有联调证据。统一入口调整的菜单、单包构建和内部 RSI 联调结果记录在本节末。

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

### 统一入口验收

统一入口证据根目录：`/Users/notyourkay/Manus-brainary/.local/v2-unified-entry-20261113`。本轮使用真实 TUI 菜单，未设置 MANUS_INPUT_FILE；两个操作都运行同一个 `/poa fg /Users/notyourkay/Manus-brainary/dist/manus.poa`。

- “执行新任务”：运行 `af4c9a6d-b33b-45c1-baf0-d73d427fed91`，真实工具调用 2 次，Agent 调用 3 次，13/13 客观检查通过。
- 构建检查：dist 仅有 manus.poa 一个应用包；旧的独立 RSI 产物已清除。生成的 task.poa 不含 Manus 菜单，并带有本次执行通过的证据。
- 自动检查：38 个测试通过，lint、typecheck 和 package 通过。演示准备脚本已实际运行，打印统一入口的两种操作说明。
- 内部 RSI：实验 `443ddf3f-f454-4fe4-bcdf-e0e984999f3c` 完成八次真实评估，每次 13/13 客观检查通过。内层调用 4→4、外层 6→6，正确保留基线；check-rsi 返回 verified: true，原资产未改变。

```bash
node scripts/check-run.mjs .local/v2-unified-entry-20261113/artifacts/manus/runs/af4c9a6d-b33b-45c1-baf0-d73d427fed91
node scripts/check-rsi.mjs .local/v2-unified-entry-20261113/artifacts/manus/rsi/443ddf3f-f454-4fe4-bcdf-e0e984999f3c
```

## 9. 人工签收

| 契约 | 人工核对 | 状态 |
| --- | --- | --- |
| V2-H1 | 后续生成读取已发布策略/经验；来源、版本完整；人工经验共存 | pending |
| V2-H2 | 真实经历复盘、候选谱系、原资产文件不变 | pending |
| V2-H3 | 相同输入与条件，八次真实对照，选择可重算，篡改副本被拒绝 | pending |
| V2-H4 | 选中任务包在新会话直接执行；外层策略作用于后续生成 | pending |
| V2-H5 | 采用与保留分支、联调证据和操作可复现 | pending |
| V2-H6 | 构建只有一个 Manus 应用包；同一入口可完成生成执行和内部 RSI；task.poa 直接重跑 | pending |
| V2-H7 | 六区 WM、四类更新节点、检查读回与证据引用、实际纠偏 | pending |
| V2-H8 | 自动一轮、无信号跳过、评估不递归、来源 WM 恢复、主动复盘保留 | pending |
| V2-H9 | 澄清问题的保存与清理、步骤/重试前即时更新、终态一致、重跑和对照兼容 | pending |

本分支完成后等待用户人工验收，不自动合并 main。

## 10. WM 分区与自动 RSI 验收（V2-H7—H8）

运行正常订单请求后查看 runs/<id>/wm-snapshot.json：task/generation/execution/metacognition/evidence/rsi 六区分别显示状态与引用（每区 entries[0].value），不再有 record 字符串。完整过程查看 trace.jsonl、tool-calls.jsonl、metacognition.json 和 checks/。检查输入快照来自 WM read_data；检查输出包括 coverage、progress、problems，证据引用可打开。

仍使用第 3 节的两步旧策略演示；检查器若判断规则重述构成冗余，应在任务结束后自动进入 RSI，无需再次选菜单。若未发现需要改进的证据，rsi.reason 应说明跳过原因，仍可按第 4 节主动复盘。普通一步成功任务应直接结束。新的总调用指标包含方案检查和完成检查，以 comparison 中实际 trace 计数为准，不使用历史证据的调用常数。

- V2-H7：方案结束、步骤结束、失败、任务结束均有状态更新；有失败时检查反馈进入下一次尝试，依赖步骤仅在通过后执行。完成后的客观检查与模型判断分别保存。
- V2-H8：来源 record.rsi 与 WM rsi 对应同一个 cycle；运行 check-rsi 验证八个对照及选择。各评估运行 record.rsi.reason 为评估运行不递归。自动周期结束后 WM 恢复来源 runId，原任务状态不被评估状态替换。

V2-H7、V2-H8 人工签收为 pending。

### 复现任务内纠偏与自动触发

为稳定验收失败分支，使用隔离的人工故障注入策略（不写入日常记忆）：

```bash
node scripts/prepare-rsi-demo.mjs .local/my-correction-demo correction
```

照脚本打印的环境与命令启动 Brainary，运行 manus.poa 并输入打印的订单请求。这份策略要求任务 Agent 初次只声明尚未执行，收到检查反馈后才实际 read/计算/write；步骤 maxRevisions=1。它只注入待测行为，失败检查、修订输出、回执和指标全部来自真实模型执行。

预期：方案检查可能提前指出该问题；第一次步骤检查必须判未完成，保存 check_failed 的 WM，随后 step_revision 把反馈传回同一角色的新实例。第二次应产生真实读写回执并通过 13 项客观检查。任务结束后，无需另发命令即可自动进入一轮 RSI。检查 record.monitoring.revisions、record.rsi.sourceChecks 与 cycleId，以及 trace 中的 plan_correction/step_revision/automatic_rsi_started；八个评估均不继续触发 RSI。完成后运行 check-run 和 check-rsi。若模型产生不同结果，按实际失败/采用记录定位，不把预期当作证据。

### 本次真实联调证据

- 无触发信号的运行：`.local/v2-wm-auto-20261113/artifacts/manus/runs/1ded9795-abc0-4401-9ebd-33dc330f120c`。两步正常执行，4 次元认知检查，7 次总 Agent 调用，2 次工具调用，13/13 客观检查通过；rsi.status=skipped，理由为没有失败、纠偏或冗余证据。check-run 通过。
- 真实纠偏与自动启动：`.local/v2-wm-correction-20261113/artifacts/manus/runs/7637be8d-5f66-4e5f-9432-cef38ebdffed`。plan_completed → step_completed 失败 → check_failed 状态更新 → 唯一一次 step_revision → step_completed 通过 → task_completed 通过；7 次总 Agent 调用、2 次真实工具调用、13/13 客观检查通过。check-2-failed-wm.json 保存失败现场；trace 的下一次任务输入包含 previousOutput 与原检查反馈。来源检查触发 cycle `92768fca-96f4-4de3-b50a-0ed67c72cc4e`，无需用户另发 RSI 命令。

联调曾发现模型抄写长路径产生错误运行 ID。最终接口改为模型使用短证据标识、程序解析到真实文件，检查器仍只接受本次实际读回的资料。旧失败记录 `663f4dca-3117-421a-9b87-f70b2e2bce8c` 保留在隔离目录，不作为通过证据。

独立任务包复验：`.local/v2-wm-replay-20261113/artifacts/manus/runs/116b4799-e11c-4f3f-9cca-d8c9513098f5`，在新工作目录和新 Brainary 会话运行复制的原 task.poa，无输入、0 次生成、6 次 Agent 调用、2 次工具调用，13/13 检查通过。原 Agent 定义不变，实际实例全新；一轮修订后 rsi.status=recommended，cycleId 为空，没有自动实验。与来源运行联合执行 check-run 已通过。

自动周期 `92768fca-96f4-4de3-b50a-0ed67c72cc4e` 已完成，八个评估运行均 13/13 客观通过。内层调用 12→10、外层调用 14→10，均采用候选并发布 2 条经验。内层 B 候选还出现过真实计算遗漏，元认知从输入和 read/write 回执发现客户净额错误并要求修正；额外修订调用已计入上述指标。所有评估 record.rsi.status=skipped；来源轨迹只有一次 automatic_rsi_started，结束后来源 record.rsi.status=completed，WM 恢复到来源 runId，并关联同一 cycleId。原资产哈希不变。check-rsi 与来源/独立重跑的 check-run 全部返回 verified: true。

```bash
node scripts/check-run.mjs .local/v2-wm-correction-20261113/artifacts/manus/runs/7637be8d-5f66-4e5f-9432-cef38ebdffed
node scripts/check-rsi.mjs .local/v2-wm-correction-20261113/artifacts/manus/rsi/92768fca-96f4-4de3-b50a-0ed67c72cc4e
node scripts/check-run.mjs .local/v2-wm-replay-20261113/artifacts/manus/runs/116b4799-e11c-4f3f-9cca-d8c9513098f5 .local/v2-wm-correction-20261113/artifacts/manus/runs/7637be8d-5f66-4e5f-9432-cef38ebdffed
```

本次 lint、typecheck、47 个自动测试、package 全部通过。校验摘要与最终构建哈希保存在 `.local/v2-wm-correction-20261113/verification.json`。自动测试同时验证无信号跳过、评估隔离、一个来源不重复启动周期、自动周期失败时保留原任务结果。代码推送 `codex/v2-rsi`，等待用户人工签收。

## 11. WM 阶段维护验收（V2-H9）

本次保持六区、一个 PoA 作用域和现有证据文件。WM 版本为 4，生成依据由程序根据实际事件写入，未增加模型调用。RSI 触发、候选评估和采用规则沿用第 4、10 节。

### 操作与预期

1. 按第 2 节构建，在 TUI 运行 `dist/manus.poa`，选择新任务，输入“请核对我的订单结算并生成报告”，暂不提供材料。出现补充询问时，在另一个终端进入 Brainary 的启动目录，用 `ls -td artifacts/manus/runs/* | head -n 1` 找到最新运行目录。将下方占位符替换为该路径，查看本次运行的 WM：

   ```bash
   node --input-type=module - <本次运行目录> <<'NODE'
   import {readFileSync} from 'node:fs';
   const w=JSON.parse(readFileSync(process.argv[2]+'/wm-snapshot.json','utf8'));
   console.log({task:w.task.entries[0].value.status,generation:w.generation.entries[0].value,execution:w.execution.entries[0].value});
   NODE
   ```

   `generation.status=awaiting_input`，`pendingQuestion` 为当前询问。回复 `/Users/notyourkay/Manus-brainary/examples/orders-a.csv` 后，已解决的问题立即清空；生成完成后为 `generated`，`bundleRef` 指向实际方案。理解和生成阶段分别为 `understanding`、`generating`，不表示模型内部推理阶段。

2. 执行中重复上面的查看命令。步骤开始即 `activeStep` 为当前步骤、`attempt=0`；调用任务 Agent 前为 `attempt=1/status=running`。输出后为 `checking`，准备重试时为 `retrying`，第二次调用前已经是 `attempt=2/status=running`，`outputRef` 清空。短暂阶段可从现有轨迹核对：

   ```bash
   node --input-type=module - <本次运行目录> <<'NODE'
   import {readFileSync} from 'node:fs';
   const events=readFileSync(process.argv[2]+'/trace.jsonl','utf8').trim().split('\n').map(JSON.parse);
   console.table(events.filter(e=>e.type==='wm_state_updated').map(e=>({cause:e.cause,generation:e.generation.status,question:e.generation.pendingQuestion,execution:e.execution.status,step:e.execution.activeStep,attempt:e.execution.attempt})));
   NODE
   ```

   `wm_state_updated` 保存 SDK 实际读回摘要，事件在相应 `agent_requested` 前。步骤结束清空当前指针，历史尝试在 `execution.json` 和 `checks/`；完整回执仍在 `tool-calls.jsonl`。

3. 最终检查期间，`task.status=running`、`execution.status=checking`，无活动步骤。完成或失败后，`execution.status` 与 `record.status` 相同，`activeStep` 为空、`attempt=0`、`outputRef` 为空。查看最后一个 `checks/*-wm.json` 可核对检查进行时的状态，最终 `wm-snapshot.json` 可核对终态。生成阶段异常为 `generation.status=failed` 并清空问题；生成完成后的执行异常保持 `generated`，复用资产执行异常保持 `reused`。

4. 按第 5 节将本轮新导出的 `task.poa` 复制到新目录，在新 Brainary 会话直接运行。全程 `generation.status=reused`，无输入询问、无生成调用。用 `check-run.mjs <重跑目录> <本次生成目录>` 验证 Agent 定义相同、实例与运行 ID 不同、业务和 WM 记录一致。

5. 重试、最终失败和 RSI 内外层状态可复核下表的真实证据。需重做这三条路径时，在 `.local/v2-wm-timing-20261113/evaluation` 目录启动 Brainary，执行 `/poa fg /Users/notyourkay/Manus-brainary/.local/v2-wm-timing-20261113/state-evaluation-check.poa`。该本地联调驱动直接调用现有 `evaluate`，依次运行：保留一次重试的内层资产、将测试副本 `maxRevisions=0` 的失败用例、正常外层生成。原来源资产不变；驱动源码保存在同根目录的 `evaluation-driver.ts`，本地包不属于产品入口。检查输出的 `state-evaluations.json` 中新运行路径，内层始终 `reused`，外层经历 `understanding→generating→generated`，三者 `rsi.status=skipped`。这是状态链路验证；完整候选选择的既有证据见第 10 节。

### 本轮实测证据

根目录：`/Users/notyourkay/Manus-brainary/.local/v2-wm-timing-20261113`。Brainary/SDK `0.2.0-rc`，模型 `gpt-5.6-sol/custom`，执行器 `manus-executor-v2.2`。以下均为修正最终检查时序后的构建实际运行。

| 验证项 | 运行目录（相对证据根目录） | 实际结果 |
| --- | --- | --- |
| 询问、补充、生成与执行 | artifacts/manus/runs/270e847a-011f-4774-b6da-d396a8797386 | 等待时问题可读，回答后清空；generated；13/13，6 次 Agent 调用（含两次生成），2 次工具调用 |
| 新会话独立任务包 | replay/artifacts/manus/runs/4b3054cb-bc92-4384-bf3e-47e9416a1ff3 | reused；13/13，0 次生成、4 次总 Agent 调用、2 次工具调用；定义相同，新实例 |
| RSI 内层重试 | evaluation/artifacts/manus/runs/f3789216-10e8-4162-899c-c3d40fd06500 | reused；调用前依次为 attempt=1、2；13/13，6 次 Agent 调用、2 次工具调用 |
| RSI 内层最终失败 | evaluation/artifacts/manus/runs/0abe65df-bfbf-4763-a1f6-64010f007a0e | 测试副本禁止重试，真实失败；WM/record 同为 failed，指针清空；1/4，4 次 Agent 调用、0 次工具调用 |
| RSI 外层生成执行 | evaluation/artifacts/manus/runs/7374ea1a-ee8a-40b8-9c07-0eeab6ef4c9a | understanding→generating→generated；13/13，5 次 Agent 调用、2 次工具调用 |

等待时实际读取的 record 与 WM 保存在 `waiting-evidence-final.json`，并记录回答后的空问题状态。`verification.json` 汇总上述运行、最终检查的 running/checking 状态、调用数、通过数及构建哈希。核验覆盖六区快照与真实 record 投影一致、调用前状态顺序、失败终态、重跑定义与实例；调用总数等于生成次数＋真实执行尝试＋原有检查次数。

```bash
cd /Users/notyourkay/Manus-brainary
node .local/v2-wm-timing-20261113/verify-state.mjs
```

预期 `verified: true`。其中四个成功用例均经过 `scripts/check-run.mjs` 核查，失败用例按预期失败验收并核对 WM 与记录。`check-run` 本身用于成功任务，不对刻意失败的运行要求通过。证据文件保留在本机 `.local`；Git 中只更新现有设计、计划、验收手册及实现。

lint、typecheck、50 个自动测试和 package 全部通过。新增测试使用真实 RunJournal、WM SDK 校验/读回和实际文件脚本，只替换模型与宿主传输边界；包括多步骤切换、尝试前持久化、生成失败和复用资产异常清理。人工契约 V2-H9 等待用户签收，不合并 main。
