# Manus V1 人工验收手册

更新：2026-11-13。Manus 通过自然语言接收任务，由外层 Agent 理解请求并生成可复用的任务 Agent。订单 CSV 是真实工具验收样例。

## 1. 构建与启动

```bash
cd /Users/notyourkay/Manus-brainary
pnpm install --frozen-lockfile && \
pnpm lint && \
pnpm typecheck && \
pnpm test && \
pnpm package && \
/Users/notyourkay/brainary-rc-0.2.0/bin/brainary
```

按本机默认配置启动即可。在 TUI 运行：

```text
/poa fg /Users/notyourkay/Manus-brainary/dist/manus.poa
```

出现一个任务输入框。直接描述要做的事情，已有内容、约束和文件位置放在同一段话里；没有材料的任务不需要另交材料。

## 2. H1：无需材料的自然语言任务

只复制下面的任务文字：

```text
介绍三个适合初学者的时间管理方法，每个方法给一个今天就能做的例子。
```

预期：没有固定的“材料输入”问题；外层生成可复用角色和步骤，任务 Agent 交付三个方法与例子。record.json 保存完整 request，understanding.json 保存模型理解，任务包单独保存定义和原请求。文本任务标记 model-only，不冒充客观业务验收。

只有完成任务确实缺少必要信息时，Manus 才提出针对性问题。例如只说“核对我的实际订单结算金额”但没给订单数据时，应询问数据位置；答案加入本次任务记录。

## 3. H2/H3：领域规则与真实工具

重新运行 Manus，输入一段完整请求：

```text
请核对 /Users/notyourkay/Manus-brainary/examples/orders-a.csv 中的订单结算，给出总额、退款、净额和客户汇总，并生成以后能继续处理同类任务的 Agent。
```

预期：模型从请求中识别任务和文件位置；采用订单领域规则；生成角色选择 exec_command；实际读取 CSV、计算并写 report.json。任务工具回执与报告均存在。

| 指标 | orders-a | orders-b |
| --- | --- | --- |
| 总行数 | 4 | 5 |
| 纳入结算行数 | 3 | 4 |
| 取消行数 | 1 | 1 |
| 原始有效金额（分） | 17010 | 2630 |
| 退款（分） | 3010 | 1044 |
| 净额（分） | 14000 | 1586 |

A 的客户甲为 14000 分，客户乙为 0；B 的“客户,丙”为 20 分，客户丁为 1000 分，客户戊为 566 分。

context.json 应记录领域资料 orders-settlement 的来源、版本和规则；生成步骤应说明取消排除、退款冲减、整数分与客户汇总，并保存 knowledgeRefs。观察报告中的取消订单排除和零净额客户保留，确认规则实际影响方案和结果。

## 4. H4：证据与状态

| 文件 | 验收内容 |
| --- | --- |
| request.json / understanding.json | 所有运行保存完整请求；生成运行另外保存外层模型提炼结果 |
| asset.json / original-request.json / original-input.json | 可复用定义与本次请求、资料分开保存 |
| dependencies.json | Runtime、SDK、Node、模型与工具依赖 |
| input.json / input.csv 或 input.txt | 本次实际处理内容、来源和哈希 |
| context.json | 使用的领域资料、人工经验、经历及来源 |
| tool-calls.jsonl / report.json | 真实读写操作、参数、实例、输出与时间 |
| trace.jsonl / record.json | 生成、执行、检查、状态和错误 |
| acceptance.json / asset-state.json | 检查结果、测试输入、运行条件及资产状态 |
| wm-snapshot.json | WM read_data 导出，与最终记录一致 |

`generated` 表示已生成包，`executed` 表示有执行结果，`validated` 表示列明输入和条件下通过客观检查。模型检查与客观检查分别保留，人工签收为 pending。

```bash
node scripts/check-run.mjs <运行目录> [原生成运行目录]
```

成功订单运行预期 verified=true；修改报告副本中的净额后核查应失败。只改副本，保留真实证据。

## 5. H5/H6/H7：任务包直接重跑

用更新后的 Manus 生成 A 的任务资产。资产目录中只应导出 task.poa。复制该包到其他工作目录，用默认配置启动新的 Brainary 会话，运行 `/poa fg <任务包绝对路径>`，无需输入任何内容。

预期：不出现任务输入框，直接使用包内原请求/快照；净额为 14000 分，输入哈希与 A 相同，不依赖原文件位置。mode=replay，asset ID、定义和方案不变，生成调用为 0，新 run 与新实例产生。任务包不再因等待用户填写任务而耗尽执行时间；模型与工具调用仍有正常执行时限。

本轮撤回 task-new.poa，显式同类新任务调用暂缓。POA_INPUT / MANUS_INPUT_FILE 仍供 Manus 生成入口使用，任务包不读取它们。可在启动任务包的会话中设置指向 B 请求的 MANUS_INPUT_FILE，结果仍应使用 A 的快照。已有包不会随源码更新，需重新生成。

截图中的 fail 是中文语言环境改变客户汇总排序，导致固定顺序断言失败，金额本身一致。当前验收采用确定性排序，中英文环境均应通过：

```bash
LANG=zh_CN.UTF-8 LC_ALL=zh_CN.UTF-8 pnpm test
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm test tests/validation.test.ts
```

## 6. 经验与经历读取

经历索引在 artifacts/manus/episodes/index.json。再次运行应召回同类历史，context.json 保存来源 run ID 和记录路径。查询：

```bash
node resources/memory.mjs artifacts/manus order-audit 订单
```

人工经验维护在 knowledge/experiences.json，或用 MANUS_EXPERIENCE_FILE 指向外部文件。修改条目版本后运行，应在 context.json 中看到实际内容、版本和来源；程序不自动改写经验。

跨目录共享记忆时，启动命令增加：

```bash
MANUS_MEMORY_ROOT=/Users/notyourkay/Manus-brainary/artifacts/manus \
/Users/notyourkay/brainary-rc-0.2.0/bin/brainary \
  --add-dir /Users/notyourkay/Manus-brainary/artifacts/manus
```

## 7. V1 基线自测与人工签收（2026-11-12）

本节保留 V1 基线的历史验收结果，其中同类新请求输入已于 2026-11-13 暂缓，当前入口契约以第 5、8 节为准。

2026-11-12 已在默认配置的 Brainary 0.2.0-rc 中完成以下联调。任务 Agent 使用 custom / gpt-5.6-sol。lint、typecheck、中文环境下 9 个测试文件的 28 项测试和 package 均通过；客户汇总测试另在英文环境通过。当时生成器与执行器均为 v1.3。

| 验证 | run ID | 结果 |
| --- | --- | --- |
| 无材料任务 | 18651c54-6ede-4343-8487-1b4bf0775db3 | 直接生成三个时间管理方法及例子，没有材料追问；model-only |
| 必要澄清 | 293f121b-8058-4fed-8a05-767241abb07f | 缺少订单数据时询问位置，补充自然语言后继续完成；13/13 检查通过 |
| 自然语言生成 A | 383d3e98-f049-48d4-96c1-6a261399d0c1 | 提取文件位置并生成新资产；净额 14000 分，13/13 通过 |
| 新会话默认重跑 A | ac6639b2-c0db-4921-a303-7a1093f07802 | 无输入框，直接使用包内快照，读写各一次；净额 14000 分，13/13 通过 |
| 新会话显式复用 B | bab380da-39dc-40dd-9565-5d84c6cb62a9 | MANUS_INPUT_FILE 传入自然语言请求，无输入框，读写各一次；净额 1586 分，13/13 通过 |

后三次使用同一资产 8ed90936-b117-4be0-9aea-5b117f754308。独立目录中的包与原包哈希一致；B 与重跑 A 的生成调用均为 0，定义与方法保持一致，运行实例不同。本次生成调用总计 3 个 Agent 实例，任务包每次 2 个；原任务重跑的材料哈希与 A 一致。把报告副本净额增加 1 分后，核查器拒绝该结果。

本轮联调摘要在 `artifacts/manus/verification-20261112/v1-complete/summary.json`，包含每次请求、核查结果、生成/工具调用次数、证据位置和会话 ID。生成运行保留在 `artifacts/manus/runs/`；独立目录的两次运行已原样复制到 `v1-complete/runs/`，资产状态保存在 `v1-complete/asset-state/`。前期无材料、澄清及路径提取的证据保留在同级 `natural-input/summary.json`。可对这些运行目录执行第 4 节核查命令。

V1 基线已验证的任务包可直接运行；本次单一重跑入口验证见第 8 节：

```text
/poa fg /Users/notyourkay/Manus-brainary/artifacts/manus/assets/8ed90936-b117-4be0-9aea-5b117f754308/task.poa
```

验收自己生成的 Agent 时，先运行更新后的 `dist/manus.poa`，再使用本次新生成的包。此前导出的包仍包含当时的程序，不随源码更新。

| 契约 | 内容 | 结论与依据 |
| --- | --- | --- |
| H1 | 完整自然语言任务、无材料任务、必要澄清 | 用户确认其余验收无问题，2026-11-12 |
| H2 | 领域规则、人工经验和经历实际参与 | 用户确认其余验收无问题，2026-11-12 |
| H3 | 任务 Agent 调用真实工具并输出正确结果 | 用户确认其余验收无问题，2026-11-12 |
| H4 | 客观检查、证据与资产状态 | 用户确认其余验收无问题，2026-11-12 |
| H5 | 新会话复用定义处理新请求、原快照重跑 | 复用能力已确认，默认入口按本轮反馈调整 |
| H6 | 中文环境测试、无等待默认重跑、显式新输入 | 本轮真实联调与自动回归通过，证据见上表 |

按用户本轮指示，V1 标记完成，GitHub 阶段标签为 `v1-complete`。每个新生成资产仍保留自己的 humanAcceptance 状态，阶段完成不代替后续任务的人工签收。自动经验提炼和内外层 RSI 属于 V2，尚未启动。

## 8. H7：恢复直接重跑入口

2026-11-13 按用户反馈撤回双入口方案。当前版本只导出 task.poa，固定执行原任务，不接收新的任务输入。生成器为 v1.3，执行器为 v1.5。

人工契约：按第 5 节从最新 Manus 生成资产并在新会话重跑；不出现任务输入框，结果为 A 的 14000 分、13 项客观检查通过。原请求、输入哈希、assetId、Agent 定义与方案保持一致，生成调用为 0，运行记录和 Agent 实例重新创建。

lint、typecheck、9 个文件的 27 项测试、package 均通过。默认 Brainary 0.2.0-rc 配置下，任务 Agent 使用 custom / gpt-5.6-sol，真实联调如下：

| 验证 | run ID | 结果 |
| --- | --- | --- |
| 最新 Manus 生成并执行 A | 351cab3c-adaf-418d-aaa9-c37deee37206 | 仅导出 task.poa，净额 14000 分，13/13 检查通过 |
| 独立目录、新会话重跑 | 610aed65-b215-465f-be86-c1543e40d73d | 环境变量指向 B 请求，仍执行 A；净额 14000 分，13/13 检查通过 |

两次使用同一资产 `2270c883-d5a6-47f4-8db6-62282540b7e5`。重跑无任务问答，原请求与输入哈希一致，生成调用为 0，新建 2 个 Agent 实例，真实工具读取、写入各一次。独立目录中的包与原包字节相同。

证据摘要在 `artifacts/manus/verification-20261113/replay-only/summary.json`，含实际核查结果、被忽略的 B 请求、包哈希和会话 ID；独立重跑记录原样复制到同目录的 `runs/`。生成记录保留在 `artifacts/manus/runs/`。

本次已验证包可直接验收：

```text
/poa fg /Users/notyourkay/Manus-brainary/artifacts/manus/assets/2270c883-d5a6-47f4-8db6-62282540b7e5/task.poa
```

分支推送后创建到 main 的 PR，保持待评审状态。H7 开发自测通过，人工签收待用户确认；V2 尚未启动。
