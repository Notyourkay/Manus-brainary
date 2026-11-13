# Manus V1 实施计划与人工验收契约

更新：2026-11-13。设计见 ../design/manus-demo-v1.md，操作与签收见 ../acceptance/phase-1.md。采用轻量 SDD，沿用模板的 TypeScript、Vitest、Biome 和 Rolldown。V1 验收收尾完成，阶段标签为 v1-complete；V2 尚未启动。

## 任务 1：自然语言任务理解与生成

文件：src/input.ts、generator.ts、bundle.ts、main.ts；tests/input.test.ts、generator.test.ts。

- 单一任务描述入口；外层 Manus 提炼可复用目标、约束及本次资料，生成 Agent 定义和执行方法。
- 无资料要求的任务直接执行；必要信息缺失时才追问。用户不填写目标/材料字段。
- 模型返回 ready（方法、资料、方案）或 clarify（问题），在模型输出边界校验一次。
- 保存 request.json、understanding.json 与生成轨迹；本次资料不固化进定义。

人工契约 H1：只输入“介绍三个适合初学者的时间管理方法”，应直接生成和执行；带文件位置的完整请求由模型提取正确地址。指标：没有固定材料追问，原请求与提炼结果可查。只有真实订单资料缺失时才问数据在哪里。

## 任务 2：领域资料、经验与经历

文件：knowledge/、src/context.ts、resources/memory.mjs；tests/context.test.ts、memory.test.ts。

- 小型领域资料维护概念、关系、业务规则、解法、来源和版本；检索候选资料，按模型识别的任务选择最终上下文。
- 生成步骤引用实际领域规则并描述处理方法。
- 索引旧/新运行记录，按场景与关键词查询；读取人工经验和外部配置，保存实际来源。

人工契约 H2：订单方案体现取消、退款、整数分和客户汇总规则；普通文本任务不套用订单规则。后续运行召回前次经历，外部经验版本变更出现在 context.json。自动经验提炼不在本轮。

## 任务 3：任务包与真实工具

文件：src/task-package.ts、task-main.ts、agent.ts、execution.ts；resources/order-tools.mjs、table-core.mjs；tests/tools.test.ts、task-package.test.ts。

- 任务包保存定义、方案、原始请求、资料快照、脚本、依赖及验证证据。
- 独立包固定重跑原请求/快照，不读取新任务输入，也不再调用生成器；同类新任务入口暂缓。
- 工具读取后保存原始内容和哈希，读写回执关联真实实例。重跑使用包内快照。

人工契约 H3：无源码目录运行 task.poa，任务 Agent 实际调用 exec_command 的 read/write，输入和报告有可核对的回执；A 快照重跑得出 14000 分。脚本随包，运行依赖由外部环境提供。

## 任务 4：客观检查与资产状态

文件：src/validation.ts、records.ts、run.ts、evidence.ts；scripts/check-run.mjs；tests/validation.test.ts。

- 模型检查接收真实工具回执；客观检查独立复算报告、金额、规则和来源。
- 区分 generated、executed、validated 和人工签收；记录输入、模型、工具、环境与结果。
- 包装成功不等于能力通过；文本任务保留 model-only 语义。

人工契约 H4：正确报告通过检查；错误金额、缺失工具或知识引用失败。历史结果保留，humanAcceptance 不由程序代签。证据为 acceptance、asset-state、完整输入与运行条件。

## 任务 5：真实联调与交接（2026-11-12 基线）

- [x] lint、typecheck、28 项测试、package 通过。
- [x] 默认 Brainary 配置下完成无文件任务、含文件位置的自然语言订单任务，以及缺少必要资料后的澄清。
- [x] 新会话用同一任务包执行 B，并重跑原请求；定义不变，生成调用为 0。
- [x] 在现有验收手册中集中记录证据，清理临时调研和历史问题文档。
- [x] 停在 V1，交用户人工签收。

人工契约 H5：按手册在新会话执行同一包，重跑 A 为 14000 分；请求、资料、知识、工具、检查和状态完整。此前 B 复用结果保留为历史证据，新任务入口以任务 7 的当前契约为准。

## 任务 6：V1 验收收尾与发布（2026-11-12 基线）

用户于 2026-11-12 确认其余验收内容通过，本轮处理客户汇总测试的语言环境差异和任务包默认入口，完成后推送 GitHub，标记 V1 完成。

- [x] `src/validation.ts`：预期报告与实际报告采用同一确定性客户排序，去掉对系统默认语言的依赖。用 `LANG/LC_ALL=zh_CN.UTF-8` 复现截图失败，再分别用中英文环境执行真实测试。
- [x] `src/input.ts`：任务包未收到显式输入时直接 replay，不调用 ask；显式输入沿用完整自然语言请求。`tests/input.test.ts` 覆盖默认重跑和显式新任务，`src/main.ts` 同步交付提示。
- [x] 保持原包定义与原快照不变，真实验证新生成包在新会话无输入即重跑；通过已有 `MANUS_INPUT_FILE` 显式输入 B，确认不重新生成定义且结果为 1586 分。
- [x] 联调发现生成器曾给规则 ID 添加 `domain.rules/` 前缀；提示词直接列出允许 ID，要求逐字复制，保留既有引用校验。
- [x] 更新现有设计、手册、README，说明 Agent 角色/实例、检查规范、两类 PoA 产物与发布状态；完成 lint、typecheck、测试、package。
- [x] 提交 V1 代码与文档，推送 main，并创建 `v1-complete` 阶段标签；V2 不启动。

人工契约 H6：中文环境测试通过；新窗口直接运行最新 task.poa，不出现输入框，使用包内原请求/快照完成任务，mode=replay、生成调用为 0。只有显式传入请求时 mode=new；错误金额仍被客观检查拒绝。GitHub main 与 v1-complete 指向本次完成提交。

## 任务 7：恢复任务包直接重跑

分支：`codex/task-reuse-ux`。用户于 2026-11-13 决定撤回双入口方案，暂不提供显式新任务调用。本任务替代此前 H7 双入口验收；历史测试证据保留在 artifacts 中。

- [x] `src/task-package.ts`、`src/main.ts`、`src/contracts.ts`：只导出 task.poa，恢复单包返回值与交付命令，删除入口模式类型及双包模式。
- [x] `src/task-main.ts`、`src/input.ts`：入口固定 mode=replay，使用 originalRequest 与 originalInput；移除任务包输入读取和新请求解析，保留 Manus 生成输入。`src/records.ts` 更新执行器版本。
- [x] `tests/input.test.ts`、`tests/task-package.test.ts`：删除撤回功能的测试，保留自然语言生成输入、真实快照和 ZIP 载荷验证；运行 lint、typecheck、test、package。
- [x] 用更新后的 Manus 导出 A 任务包，在独立目录的新 Brainary 会话运行；即使环境中存在指向 B 的 MANUS_INPUT_FILE，也应无问答重跑 A，净额 14000 分、13 项检查通过、生成调用为 0。
- [x] 同步现有设计、手册、README；推送本分支并创建到 main 的 PR，停止在待评审状态。V2 后续单独建分支。

人工契约 H7：最新 Manus 每次只导出 task.poa；新会话直接运行，无任务输入框，使用原请求与快照。输入哈希、assetId、Agent 定义和方案与生成时一致，runId 与实例更新，真实工具和验收证据完整。POA_INPUT / MANUS_INPUT_FILE 不改变任务包的请求。旧包需重新生成，显式同类新任务暂不验收。
