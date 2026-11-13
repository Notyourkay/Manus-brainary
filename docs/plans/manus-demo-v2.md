# Manus V2 实施计划与人工验收契约

更新：2026-11-13。目标：自动经验提炼、内外层 RSI、固定用例对照和版本选择。设计见 ../design/manus-demo-v2-target.md，人工操作见 ../acceptance/phase-2.md。沿用轻量 SDD、TypeScript、Vitest、Biome、Rolldown、Brainary 0.2.0-rc；在 codex/v2-rsi 分支开发。

## 任务 1：版本与已验证经验读取

文件：src/contracts.ts、generator.ts、main.ts、context.ts、records.ts；src/rsi/contracts.ts、store.ts；resources/learning.mjs。

- [ ] 定义 GeneratorStrategy、Experience provenance、Asset lineage 和 EvaluationTag；保持旧资产字段兼容。
- [ ] 实现 loadLearning(root) / publishLearning(root, update)，真实文件保持各场景策略与已发布经验。
- [ ] 生成前加载按场景选择的策略和经验，保存 strategy_selected 轨迹与 asset/record 快照；固定生成契约不受策略改写。
- [ ] 测试临时目录中首次空读取、发布、重新加载、候选不召回及人工经验共存。

人工契约 V2-H1：后续 Manus 的 context.json 显示自动经验 ID、来源、适用条件和验证范围；asset.json / record.json 显示实际采用的策略。未发布候选不出现，旧包可继续重跑。

## 任务 2：经历复盘与候选边界

文件：src/rsi/proposal.ts、contracts.ts、store.ts；tests/rsi-proposal.test.ts。

- [ ] 从用户指定的已结束运行读取 record、asset、原始请求/快照、工具回执和资源；入口核对格式、来源和材料哈希。
- [ ] 复盘 Agent 输出诊断、实际 sourceRunIds、经验内容/适用条件、innerBundle、strategyInstructions；保存模型原文和候选。
- [ ] 复用 parseBundle 校验工具和知识引用，固定订单规则覆盖要求；不接受虚构来源或候选改变检查器。
- [ ] 测试有效候选、虚构来源、未知工具和缺失规则的实际解析器。

人工契约 V2-H2：reflection.json 能追溯到真实来源运行与读写回执，候选有新 ID/parent ID；原 asset.json 和 task.poa 哈希不变。

## 任务 3：共用执行器与确定性选择

文件：src/rsi/evaluation.ts、comparison.ts；tests/rsi-comparison.test.ts；examples/orders-c.csv、examples/rsi-suite.json。

- [ ] 用 RunJournal 和 executeAsset 执行内层候选；外层使用 generateBundle 后执行；双方使用冻结的同一上下文和材料。
- [ ] 从真实 trace/record 收集客观通过、Agent 调用、工具调用、耗时和错误；保存每个用例条件。
- [ ] compareEvaluations(baseline, candidate) 要求候选全通过；修复失败或质量不变且调用更少时采用，平局/退化/条件不一致保留基线。
- [ ] 测试通过率提升、成本下降、平局、回归、输入/条件不一致、model-only 不采用。

人工契约 V2-H3：comparison.json 逐项对应真实 run；两侧输入哈希和条件一致。人工改动比较副本中的输入哈希或候选通过状态后，检查命令拒绝。无收益时明确保留基线。

## 任务 4：内外层闭环与入口

文件：src/rsi/cycle.ts、src/rsi-main.ts、src/task-package.ts、rolldown.config.mjs、scripts/package.mjs、types/task-program.d.ts。

- [ ] 打包 dist/manus-rsi.poa，支持 TUI 一次选择来源运行目录和 MANUS_RSI_SOURCE 联调。
- [ ] 一轮内层两组、外层两组真实评估，先保存完整证据和选中包再发布策略/经验；错误保存并停止，不启动无界循环。
- [ ] 内层输出 selected/task.poa，外层更新按场景的策略；原任务包保持固定重跑。
- [ ] lint、typecheck、test、package 全部通过。

人工契约 V2-H4：TUI 显示双方质量、调用数、选择理由、包和证据路径；新任务包独立执行仍完整留痕。下一次生成实际采用外层选中版本。

## 任务 5：真实联调、证据与交付

文件：scripts/prepare-rsi-demo.mjs、scripts/check-rsi.mjs、docs/acceptance/phase-2.md、README.md、AGENTS.md。

- [ ] 准备隔离演示根目录与明确标注的两步旧策略，不伪造记录；真实生成基线。
- [ ] 真正运行 RSI，验证内层和外层有收益时采用；运行已优化版本验证无收益保留基线。
- [ ] 新会话运行选中包；再次生成订单任务验证策略和自动经验读取；核对原文件哈希未改变。
- [ ] 在现有 V2 手册记录实际 ID、指标、命令与证据；提交推送 codex/v2-rsi，停止等待人工验收。

人工契约 V2-H5：按手册可重复生成基线、运行一轮 RSI、检查选择、重跑新资产、观察下一次生成。每个采用结论都有真实对照，候选拒绝保留旧版本；用户人工签收状态为 pending。
