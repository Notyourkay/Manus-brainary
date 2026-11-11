# PoA SDK 的 Agent 工具可用性受宿主模型选择影响

状态：已有可用启动配置，未阻塞 Manus 开发；反馈材料待转交 Runtime/SDK 负责人。

## 环境与现象

- Brainary `0.2.0-rc`，发布源码标识 `f7cb5106fe3c126ee0a48549a472b7956440269f`。
- `@brainary/poa-sdk`、`@brainary/wm-sdk` 均为 `0.2.0-rc`。
- SDK `AgentExecutor.create_agent()` 调用 `tools.multi_agent_v1__create_agent`。
- 默认宿主模型为 `custom / gpt-5.6-sol` 时，PoA 的 `ALL_TOOLS` 没有 V1 Agent 工具；TUI 前台与 `exec --poa` 均可复现。
- 抛错：`ReferenceError: PoA runtime function "tools.multi_agent_v1__create_agent" is not available in this cell`。

## 最小复现

PoA 中输出工具名称：

```js
text(ALL_TOOLS.map((tool) => tool.name));
```

用同一个包比较：

```bash
brainary exec -m gpt-5.6-sol --poa <包路径> --json
brainary exec -m gpt-5.5 --poa <包路径> --json
```

后者出现 `multi_agent_v1__create_agent`、`send_input`、`get_agent_status`、`wait_agent`、`close_agent` 等工具。前者没有这些工具。显式开启 V2 并允许 code mode 使用时出现 `collaboration__*` 工具，与当前 SDK 的 V1 调用名不同。

## 目前采用的配置

启动 TUI 时使用 `brainary -m gpt-5.5`。PoA 内仍用 `AgentConfig.model` 指定 `custom / gpt-5.6-sol`。已真实完成 Agent 创建、发送消息、等待结果与关闭，返回 `MANUS_AGENT_OK`。

该验证执行 ID：`07c8c699-4c32-42e7-bdd2-a2808840ee58`。

真实成功线程：`01a1cae6-aec8-7ba1-980a-d9b77b6ebc85`；任务 Agent：`01a1cae6-af31-7541-af31-d093bdad2c0e`。本机原始日志位于 `.local/probe/gpt55.jsonl`，未包含密钥。

## 建议

PoA 是确定性程序，其 SDK 工具依赖应有清楚的启动契约。建议 Runtime 在 PoA 入口稳定提供 SDK 对应的 Agent API，或在包加载时明确提示所需版本/工具；SDK 文档同时说明宿主模型选择与工具注册的关系，避免初始化成功后才在第一次 Agent 调用处出现 ReferenceError。

Manus 未修改 SDK、未把 V2 工具重新封装成 V1，也未修改用户的全局模型配置。
