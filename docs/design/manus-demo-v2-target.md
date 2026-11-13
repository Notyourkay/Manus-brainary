# Manus V2 设计：经验提炼与内外层 RSI

更新：2026-11-13。开发分支 `codex/v2-rsi`，起点为已合入 V1 入口收敛的 main（4a70cdb）。沿用 Brainary/PoA SDK/WM SDK 0.2.0-rc 和模板工具链。实施计划见 ../plans/manus-demo-v2.md，人工验收见 ../acceptance/phase-2.md。

## 1. 目标与交付

V2 在 V1 的生成、执行、领域资料、经历召回与证据之上，完成自动复盘、经验候选、内层任务资产改进、外层生成策略改进、真实对照评估及版本选择。每次 RSI 是一轮有界实验，不在正常任务运行时无限自我迭代。

Manus 统一交付 `manus.poa`，内部包含生成执行模块和 RSI 模块：

| 入口/操作 | 行为 |
| --- | --- |
| manus.poa → 执行新任务 | 接收自然语言，读取已采用的生成策略与经验，生成并执行任务资产，结束后按检查证据自动运行至多一轮 RSI |
| manus.poa → 复盘改进已有任务 | 选择已有运行目录，内部调用 RSI 模块，复盘、评估候选并选择版本 |
| 生成的 task.poa | 直接重跑包内原任务，实例化已有定义，不询问新任务、不启动 RSI |

无启动输入时，Manus 用 SDK ask 展示以上两种操作，再接收任务描述或来源运行目录。RSI 默认由任务结束后的证据规则触发；菜单保留主动复盘已有运行的方式，不另行部署应用包。脚本联调统一使用 POA_INPUT 或 MANUS_INPUT_FILE：原有字符串或 `{ "request": "自然语言任务" }` 继续直接生成；`{ "action": "rsi", "sourceDirectory": "/absolute/runs/run-id" }` 直接进入内部 RSI。显式输入优先于交互菜单，入口只校验一次。
PoA 是编排代码，Agent 定义是可复用配置，实例由 SDK 创建并关闭。RSI 修改定义和策略数据，不改 SDK、模型权重或执行器源码。显式同类新任务调用继续暂缓。

## 2. 范围与评估场景

沿用订单结算场景验证完整闭环：CSV 读取、Agent 计算、报告写入、模型步骤检查和 13 项独立客观检查。普通文本任务仍可生成执行；自动采用 RSI 候选需要客观检查器，本版 RSI 模块只接受有完整订单资产和输入的已结束运行。

内层对照使用来源运行的原材料和固定 B 材料；外层使用 B、C 两个完整新请求，分别重新调用基线和候选生成策略，再执行生成资产。C 不提供给复盘 Agent，作为留出任务。数据快照和哈希写入实验清单，不依赖原目录后续变化。候选不看到期望报告数值，检查器按已有领域规则独立复算。

为稳定展示“通过且调用更少”的分支，提供隔离的演示准备脚本，安装一个明确标注为人工编写的旧生成策略：先单独列规则，再执行对账，共两步。脚本不伪造任何运行、失败或收益；后续生成、复盘、对照都使用真实模型和工具。正常配置使用标准策略，若已足够好则允许保留基线。

## 3. 数据契约

### 3.1 生成策略与资产谱系

GeneratorStrategy：id、parentId、scenario、instructions、sourceRunIds、createdAt。固定的生成 JSON 契约、工具目录、领域引用和客观检查不受策略覆盖；instructions 只补充生成方法。基线策略可为空补充指令。

TaskAsset 保持 V1 格式版本 2，新增可选 generationStrategy（本次所用策略完整快照）、lineage（parentAssetId、sourceRunIds、cycleId）。已有 V1 包仍可运行。内层候选使用新 assetId。基线评估也使用保留原定义的独立副本，避免不同测试材料写回原资产；保留基线时选中的是这个定义不变的副本。两侧均保留 parentAssetId，原始文件与定义不覆盖。外层生成的新资产保存所用策略 ID 与内容。内层候选保留原始 generationStrategy 作为生成来源，后续改进由 lineage 指向本轮复盘；它与 learning/state.json 中当前生效的外层策略是两个用途。

RunRecord 增加可选 evaluation（cycleId、target、arm、caseId）与 generationStrategy；mode 新增 evaluate。执行器版本记录实际执行版本；生成器版本及资产谱系分别保留。每个对照执行仍写 WM、request/input/context、trace、真实工具回执、报告和验收记录。

### 3.2 复盘与经验

复盘 Agent 接收来源运行的任务、方案、步骤尝试、模型反馈、客观检查、工具回执和当前生成策略。返回 diagnosis、sourceRunIds、experiences（content、applicability）、innerBundle、strategyInstructions。模型返回在入口校验结构、来源引用、角色/步骤/工具/规则引用；角色和步骤沿用 V1 契约。格式错误时携带具体错误修正一次，两份原文均保留；仍不符合契约则停止本轮。

经验候选由程序附加 ID、版本、场景、来源运行、cycleId 和状态。候选保存在实验目录；只有对应实验存在被采用的改进，才发布到经验存储，附带验证用例和运行 ID。经验的验证范围指包含该方法的候选整体在所列用例上通过且有收益；本版不声称通过消融验证了单条经验的独立因果作用。

经历保存“发生了什么”，经验保存“适用条件下建议怎么做”。后续 Manus 按场景读取已发布经验，记录实际来源与版本；候选经验不参与日常召回。人工经验继续保留。RSI 对照的上下文在开始时冻结，双方使用相同领域、经验与经历；过程中新增的运行不混入本轮后续测试。

### 3.3 对照与选择

每个评估样本保存 caseId、inputSha256、runId、assetId、模型/工具/Node 条件、客观是否通过、实际 Agent 调用数、工具调用数、耗时与错误。调用数取真实 trace 中的 agent_requested；外层包含生成调用。耗时只展示，不用单次墙钟时间决定采用；SDK 未提供统一 token 计量时不估算 token 费用。

采用条件：

1. 基线与候选用例 ID、输入哈希、模型、工具目录、SDK、执行器和上下文一致。
2. 候选每个用例均完成且通过所有客观检查。
3. 候选修复了基线失败，或双方全通过且候选总 Agent 调用数更少、每个用例调用数不增加。
4. 同质量同调用量、结果退化、条件不一致或只有模型自评均保留基线，记录具体理由。

结果检查 Agent 和客观检查器固定；候选不能通过删除领域规则或修改检查器获取通过。候选可合并执行步骤，仍逐步执行固定模型检查，最终必须通过固定客观检查。

## 4. 单轮 RSI 流程

1. Manus 任务结束后根据元认知记录决定是否自动运行一轮；也可选择“复盘改进已有任务”提供来源运行目录。读取实际记录、原始资产、输入与资源，校验入口。
2. 建立独立 cycle 目录，保存 source、冻结 context、当前策略、用例快照和配置。
3. 调用复盘 Agent，保存原始回复、诊断、经验候选、内层方案和外层策略候选。
4. 内层基线与候选分别在两个相同输入上调用 V1 共用执行器。比较后，导出选择的 task.poa；候选定义和全部结果留存。
5. 外层基线与候选策略分别在 B/C 上真实生成并执行。比较后保存 active 生成策略选择。
6. 先写完整 comparison/result 和选中包，再发布已采用策略及支持的经验；失败时保存 error，未完成的比较不发布。
7. TUI 展示双方通过率、调用量、采用/保留理由、选中 task.poa 和证据路径。停止一轮，等待用户验收。

旧 task.poa 保持原定义和请求。新内层版本通过选中包路径使用；外层策略在下一次 Manus 生成时加载。同一次运行不偷偷切换策略或改写原资产。

## 5. 存储与模块

| 位置 | 内容 |
| --- | --- |
| artifacts/manus/rsi/<cycleId>/ | 来源、用例、上下文、复盘原文、候选、内外层 comparison、result/error、trace、选中任务包 |
| artifacts/manus/runs/<runId>/ | 各个真实生成和评估运行；结构沿用 V1 |
| artifacts/manus/assets/<assetId>/ | 新候选/生成资产及验证状态，保存策略与谱系 |
| <memoryRoot>/learning/state.json | 按场景采用的策略与已发布经验；历史版本在各 cycle 中留存 |

src/rsi/contracts.ts 定义 RSI 数据；measurement.ts 从真实证据重新计算指标；proposal.ts 负责模型复盘边界；comparison.ts 实现确定性选择；evaluation.ts 复用生成与执行链路；cycle.ts 编排一次实验；store.ts 使用 SDK 读写应用数据。resources/learning.mjs 提供小型 JSON 经验/策略存储，resources/evaluation.mjs 读取实际运行证据，供文件测试、离线核查与 PoA 共用。src/main.ts 是统一入口，src/input.ts 负责操作选择与启动输入，src/generate.ts 负责生成执行；RSI 作为内部模块由主入口直接调用。

沿用 MANUS_MEMORY_ROOT 共享经验与策略；默认根目录为 artifacts/manus。模型凭据与服务连接继续由 Brainary 配置提供。应用使用 WM 正式读写接口保存运行状态。0.2.0-rc 的 WM 声明属于本次 PoA 执行作用域，因此一轮 RSI 共用一次声明注册，顺序写入各次运行并各自导出 WM 读回副本。`agent_id` 不用于隔离声明；不在 Manus 重建基础框架。

## 6. 验证与交接

自动测试覆盖来源/模型契约、候选隔离、采用和拒绝判定、跨输入公平性、真实文件发布与召回、版本谱系、旧包兼容；保留 V1 测试。真实联调覆盖双层候选被采用、同等候选保留基线、后续 Manus 读取采用策略和自动经验、新包独立重跑、旧资产未改变。

每项任务末尾有人工契约；操作和证据集中到 phase-2.md，不另建重复报告。完成后推送 V2 分支，停在人工验收，不自动合并 main。

## 7. WM 分区、任务内纠偏与自动 RSI

WM schema 当前版本为 4，使用 SDK 原生 Map 表达六个分区，每区 current 条目保存闭合对象；原生快照通过 `<分区>.entries[0].value` 查看，检查器读取的视图去掉 Map 包装。保留 RunRecord 格式版本 2，并增加可选 monitoring、rsi 和 generationState 字段，兼容历史记录。完整 record.json 不再编码进 WM。

| 分区 | 关键状态及引用 |
| --- | --- |
| task | runId、assetId、模式、请求、目标、场景、任务状态、输入哈希 |
| generation | 生成阶段/复用状态、待澄清问题、程序依据与证据引用、策略 ID、方案摘要、角色与步骤数、bundle/context 引用 |
| execution | 当前步骤与尝试、已通过步骤数、工具成功/失败次数、当前输出与执行记录引用 |
| metacognition | 当前检查节点、检查数、失败数、纠偏数、最近目标覆盖/进展/问题摘要、完整检查引用 |
| evidence | record、input、context、trace、tool-calls、report、acceptance 等文件引用；不存在的证据使用空引用 |
| rsi | 触发状态、规则理由、来源检查记录、cycleId、实验目录及错误 |

元认知维护四类检查节点：方案就绪（plan_completed）、每次步骤输出（step_completed）、检查失败（check_failed）、任务结束（task_completed）；执行开始与尝试开始的状态更新见第 8 节。检查失败立即持久化失败状态，复用该次检查结论，不为同一失败再增加一次模型调用。所有节点先写证据和 WM，再从 SDK read_data 读回，检查器通过 bundle、output、tools 等短标识引用证据，程序将其解析为实际文件路径；检查器使用读回状态及引用文件中的方案、领域约束、当前输出、工具回执和客观检查。每次保存 checks/<id>-wm.json、checks/<id>.json，metacognition.json 汇总结构化检查；trace.jsonl 保留完整模型输入输出，tool-calls.jsonl 保留完整回执。

固定元认知 Agent 输出 passed、feedback、coverage（目标、planned/satisfied/missing、证据引用）、progress、problems（gap/failure/redundancy、依据）。方案节点检查覆盖与可执行性，不要求尚未产生的执行结果；方案缺口反馈作为本次执行指导传给任务 Agent，不改写可复用定义。每个步骤按自身验收条件检查，不要求中间步骤完成全部最终目标；失败按 maxRevisions 纠正至多一次，反馈传给原角色，仍失败则停止依赖步骤。任务结束检查全目标与客观结果；模型不能把失败的客观检查改成通过。任务完成检查不再重跑整项任务，交由后续 RSI 处理。

自动触发规则是固定程序规则：仅 Manus 生成执行且已有完整订单输入/资产/上下文的结束任务具备自动评估条件；至少存在一次失败检查、任务内纠偏、最终客观失败，或检查器指出带证据引用的冗余步骤时触发。没有上述信号的成功任务跳过。文本任务保留元认知记录，但缺少本版的客观 RSI 评估套件，因此跳过并记录原因。RSI 评估运行不触发递归；每次正常 Manus 运行最多启动一次自动 cycle。独立 task.poa 保持直接重跑，记录建议与跳过原因，可由 Manus 主动复盘。

自动周期在任务结果、任务包和触发决定落盘后启动。自动周期失败只更新 rsi 状态，保留原任务结果；成功或失败后重新写回来源运行的 WM，避免最终状态停留在最后一个对照用例。比较双方均使用同一固定检查流程，模型调用指标包含方案、步骤和任务完成检查。复盘 Agent 读取本次全部元认知记录及触发依据。主动复盘允许对无触发信号的任务做探索。

## 8. WM 阶段状态维护

继续使用一个 PoA 作用域中的六区 WM。RunRecord 增加可选 generationState，monitoring 增加 executionStatus；WM 使用版本 4 标识扩展字段，历史版本 3 保持可读。只记录可观察事件、简短程序依据及文件引用，不读取或导出 Agent 内部推理，不增加模型调用。

### 外层生成

| generation.status | 写入时机 | pendingQuestion |
| --- | --- | --- |
| pending | 新生成运行初始化 | 空 |
| understanding | 接收请求/补充，准备场景上下文 | 空 |
| generating | 调用生成 Agent 之前 | 空 |
| awaiting_input | 生成结果为 clarify，调用 ask 之前 | 当前问题 |
| generated | ready 结果通过现有契约，方法和方案写入记录 | 空 |
| failed | 生成阶段异常结束 | 空；原问题保留在轨迹 |
| reused | 从已有包/内层对照资产初始化 | 空 |

note 由程序根据实际事件写简短说明，evidenceRef 指向现有 trace.jsonl 或 bundle.json。一次生成模型调用仍同时承担任务理解与方案生成：understanding 表示应用准备请求和上下文，generating 表示该调用在进行，不声称获取模型内部阶段。生成完成后的执行异常保持 generated；已有包执行异常保持 reused。RSI 外层通过相同生成状态接口维护，内层保持 reused。

### 内层执行

RunJournal.observeExecution 接收执行器的可观察事件，写运行记录、WM 并读回后才进入下一动作。步骤开始设 running/activeStep/attempt=0；每次尝试开始设 running/当前 step/从 1 开始的 attempt，并清空上一尝试的 outputRef；任务 Agent 返回后设 checking；检查失败将状态设 failed，准备重试时设 retrying；新尝试开始立即显示新的 attempt。步骤通过后设 between_steps，清空 activeStep/attempt/outputRef；步骤最终失败设 failed 并同样清空当前指针，具体失败位置通过 execution.json 和 checks 定位。所有步骤退出后，最终验收期间设 checking 且无活动步骤，record.status 保持 running，直到最终检查返回后才标记终态；任务结束后状态与 record.status 一致，异常退出为 error。

元认知继续在原有四类节点检查，只维护检查状态和输出证据，不再延迟写入 activeStep/attempt。阶段变化将 SDK 实际读回的 generation/execution 摘要追加到现有 trace.jsonl（wm_state_updated），不新增逐工具调用监控或额外快照文件。最终 wm-snapshot.json 保持完整六区读回。

本轮只修正状态时序，不修改 RSI 触发阈值、问题归因、候选评估及采用规则。
