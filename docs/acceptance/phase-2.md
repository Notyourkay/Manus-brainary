# Manus V2 人工验收手册

更新：2026-11-13。分支 codex/v2-rsi。验收对应计划 V2-H1—H5；开发完成后在本文件补充真实运行证据和签收表。

## 1. 构建

```bash
cd /Users/notyourkay/Manus-brainary
pnpm lint && pnpm typecheck && pnpm test && pnpm package
```

应生成 dist/manus.poa 和 dist/manus-rsi.poa。沿用本机默认 Brainary 0.2.0-rc 配置，模型和工具与 V1 相同。

## 2. 准备可重复演示

```bash
node scripts/prepare-rsi-demo.mjs
```

脚本会打印隔离的记忆根目录和启动命令，安装明确标注的两步旧生成策略。这个策略用于演示减少冗余步骤的收益，所有运行记录和指标随后由真实模型与工具产生。

按脚本打印的命令启动 Brainary，在 TUI 运行 dist/manus.poa，描述核对 examples/orders-a.csv 的结算任务。首次应生成两步方案，实际执行与客观验收通过。复制最后输出的运行目录。

## 3. 启动一轮 RSI

在同一配置的 TUI 运行 `/poa fg /Users/notyourkay/Manus-brainary/dist/manus-rsi.poa`，输入上一步运行目录。

应看到复盘、内层对照、外层对照和最后选择。核对实验目录中的 source.json、cases.json、reflection.json、inner-comparison.json、outer-comparison.json 和 result.json：

- 复盘引用真实 run ID；经验包含适用条件和来源。
- 内层改进 Agent 定义/方案，candidate 的 assetId 与来源不同，并有 parentAssetId。
- 外层改进生成策略，B/C 新任务分别调用两种策略真实生成和执行。
- 相同用例的哈希、模型、领域上下文与工具条件一致；检查器仍是固定 13 项。
- 候选全通过且修复失败或调用减少才采用；平局/退化保留基线。

用 `node scripts/check-rsi.mjs <实验目录>` 重新核对选择和运行证据。错误副本不能通过。

## 4. 验证后续使用

复制 result.json 指向的 selected/task.poa 到独立目录，启动新 Brainary 会话执行。应直接重跑原请求，无任务输入框；定义不再生成，实例重新创建，工具与验收记录完整。

回到使用隔离记忆根目录的 Manus 会话，再生成一个订单任务。检查 strategy_selected、asset.json 的 generationStrategy，以及 context.json 中自动经验的版本、来源和验证范围。原来的 asset.json/task.poa 哈希应保持不变。

再次对已优化的一步任务启动 RSI，若质量和调用量相同，选择应为保留基线；候选经验与策略不发布。由于模型输出可能有变化，以实际指标和确定性选择规则为准。

## 5. 指标与人工签收

| 契约 | 人工核对 | 状态 |
| --- | --- | --- |
| V2-H1 | 已发布策略/经验被后续生成读取，来源与版本完整 | pending |
| V2-H2 | 实际经历复盘、候选谱系、原资产不变 | pending |
| V2-H3 | 同条件真实对照与可重新计算的选择 | pending |
| V2-H4 | 选中任务包独立执行，外层策略作用于后续生成 | pending |
| V2-H5 | 完整闭环、采用与保留分支、证据与操作可复现 | pending |

普通文本任务保持 V1 行为，本版不以模型自评自动采用文本任务的 RSI 候选。显式同类新任务输入仍暂缓。完成后只推送 V2 分支，等待人工验收。
