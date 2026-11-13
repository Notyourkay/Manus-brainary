# Manus V2 实施计划与人工验收契约

更新：2026-11-13。状态：开发与真实联调完成，等待人工验收。目标：自动经验提炼、内外层 RSI、固定用例对照和版本选择。设计见 ../design/manus-demo-v2-target.md，人工操作见 ../acceptance/phase-2.md。沿用轻量 SDD、TypeScript、Vitest、Biome、Rolldown、Brainary 0.2.0-rc；在 codex/v2-rsi 分支开发。

## 任务 1：版本与已验证经验读取

文件：src/contracts.ts、generator.ts、generate.ts、context.ts、records.ts；src/rsi/contracts.ts、store.ts；resources/learning.mjs。

- [x] 定义 GeneratorStrategy、Experience provenance、Asset lineage 和 EvaluationTag；保持旧资产字段兼容。
- [x] 实现 loadLearning(root) / publishLearning(root, update)，真实文件保持各场景策略与已发布经验。
- [x] 生成前加载按场景选择的策略和经验，保存 strategy_selected 轨迹与 asset/record 快照；固定生成契约不受策略改写。
- [x] 测试临时目录中首次空读取、发布、重新加载、候选不召回及人工经验共存。

人工契约 V2-H1：后续 Manus 的 context.json 显示自动经验 ID、来源、适用条件和验证范围；asset.json / record.json 显示实际采用的策略。未发布候选不出现，旧包可继续重跑。

## 任务 2：经历复盘与候选边界

文件：src/rsi/proposal.ts、contracts.ts、store.ts；tests/rsi-proposal.test.ts。

- [x] 从用户指定的已结束运行读取 record、asset、原始请求/快照、工具回执和资源；入口核对格式、来源和材料哈希。
- [x] 复盘 Agent 输出诊断、实际 sourceRunIds、经验内容/适用条件、innerBundle、strategyInstructions；保存模型原文和候选。
- [x] 复用 parseBundle 校验工具和知识引用，固定订单规则覆盖要求；不接受虚构来源或候选改变检查器。
- [x] 测试有效候选、虚构来源、未知工具和缺失规则的实际解析器。

人工契约 V2-H2：reflection.json 能追溯到真实来源运行与读写回执，候选有新 ID/parent ID；原 asset.json 和 task.poa 哈希不变。

## 任务 3：共用执行器与确定性选择

文件：src/rsi/evaluation.ts、comparison.ts；tests/rsi-comparison.test.ts；examples/orders-c.csv、examples/rsi-suite.json。

- [x] 用 RunJournal 和 executeAsset 执行内层候选；外层使用 generateBundle 后执行；双方使用冻结的同一上下文和材料。
- [x] 从真实 trace/record 收集客观通过、Agent 调用、工具调用、耗时和错误；保存每个用例条件。
- [x] compareEvaluations(baseline, candidate) 要求候选全通过；修复失败或质量不变且调用更少时采用，平局/退化/条件不一致保留基线。
- [x] 测试通过率提升、成本下降、平局、回归、输入/条件不一致、model-only 不采用。

人工契约 V2-H3：comparison.json 逐项对应真实 run；两侧输入哈希和条件一致。人工改动比较副本中的输入哈希或候选通过状态后，检查命令拒绝。无收益时明确保留基线。

## 任务 4：内外层闭环与入口

文件：src/rsi/cycle.ts、src/main.ts、src/input.ts、src/generate.ts、src/task-package.ts、rolldown.config.mjs、scripts/package.mjs、types/task-program.d.ts。

- [x] RSI 模块完成单轮闭环；对外入口按任务 6 收敛至 Manus。
- [x] 一轮内层两组、外层两组真实评估，先保存完整证据和选中包再发布策略/经验；错误保存并停止，不启动无界循环。
- [x] 内层输出 selected/task.poa，外层更新按场景的策略；原任务包保持固定重跑。
- [x] lint、typecheck、test、package 全部通过（36 个自动测试）。

人工契约 V2-H4：TUI 显示双方质量、调用数、选择理由、包和证据路径；新任务包独立执行仍完整留痕。下一次生成实际采用外层选中版本。

## 任务 5：真实联调、证据与交付

文件：scripts/prepare-rsi-demo.mjs、scripts/check-rsi.mjs、docs/acceptance/phase-2.md、README.md、AGENTS.md。

- [x] 准备隔离演示根目录与明确标注的两步旧策略，不伪造记录；真实生成基线。
- [x] 真正运行 RSI，验证内层和外层有收益时采用；运行已优化版本验证无收益保留基线。
- [x] 新会话运行选中包；再次生成订单任务验证策略和自动经验读取；核对原文件哈希未改变。
- [x] 在现有 V2 手册记录实际 ID、指标、命令与证据；提交推送 codex/v2-rsi，停止等待人工验收。

人工契约 V2-H5：按手册可重复生成基线、运行一轮 RSI、检查选择、重跑新资产、观察下一次生成。每个采用结论都有真实对照，候选拒绝保留旧版本；用户人工签收状态为 pending。

## 任务 6：统一 Manus 入口

文件：src/main.ts、src/input.ts、src/generate.ts、rolldown.config.mjs、scripts/package.mjs、scripts/prepare-rsi-demo.mjs、tests/input.test.ts；删除 src/rsi-main.ts。

- [x] 更新设计及人工契约：一个 Manus 应用，内部选择生成执行或 RSI，RSI 保持按需的一轮评估。
- [x] 将现有生成流程移至 generateTask(request)，主入口按 readLaunch() 的 generate/rsi 结果调用内部模块。
- [x] 保留自然语言启动输入，增加统一的 `{action:"rsi",sourceDirectory}` 输入；无输入时用 SDK ask 选择操作。
- [x] 移除独立 RSI 构建和打包，正常 package 时清除旧输出，演示脚本与手册都只指向 manus.poa。
- [x] 测试入口类型与缺失输入，完成 lint、typecheck、test、package，并在 TUI 验证两个操作及内部 RSI 的真实运行。
- [x] 将证据补充到现有手册，推送 codex/v2-rsi，等待人工验收。

人工契约 V2-H6：构建后只有一个 Manus 应用包。在 TUI 运行同一 manus.poa，能分别选择并完成新任务和已有运行复盘；后者输出完整的 comparison/result 和选中 task.poa，check-rsi 通过。原 task.poa 仍直接重跑，不出现 Manus 操作菜单。
