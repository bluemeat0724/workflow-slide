# Workflow Agent 具体执行步骤

本文档是 [workflow_agent.md](/Users/g-air/projects/workflow-slide/dev_docs/workflow_agent.md) 的落地执行版，目标是把“会话式 workflow agent”拆成可以直接开工的实施步骤。

适用范围：

- 服务端多轮会话 agent
- sub agent 前缀续写生成 JSON
- 前端浮窗 chat 交互
- 执行确认后自动加载 workflow

## 1. 实施原则

执行顺序必须遵循以下原则：

1. 先打通后端会话状态和执行闸门，再做前端 UI。
2. 先让执行链路能返回合法 `Diagram`，再优化对话体验。
3. 先做最小闭环，再补恢复、重试、warnings、样式增强。
4. 所有执行结果必须复用现有导入与校验能力，不另起一套 workflow 数据格式。

不建议的顺序：

- 先做浮窗 UI，再倒推后端协议
- 先让模型直出最终坐标与 theme
- 先做复杂记忆、持久化会话、候选方案分支

## 2. 最小闭环定义

最小可交付版本必须满足：

- 页面右下角可打开 agent 浮窗
- 用户可与 agent 进行至少两轮对话
- agent 能在信息充分时给出自然语言 workflow 摘要
- agent 会明确请求用户确认执行
- 用户明确“执行”后，后端才真正生成 JSON
- sub agent 通过前缀续写生成 fenced JSON
- 服务端提取 JSON 并转换为合法 `Diagram`
- 前端将结果加载到当前画布
- 远端模式下，继续走 `persistenceService.importDiagram()`

## 3. 推荐执行顺序

建议按以下顺序实施：

1. 明确后端接口与前端契约
2. 增加 AI 配置与 OpenAI client
3. 实现会话存储与状态机
4. 实现主 agent 对话编排
5. 实现 sub agent JSON 生成
6. 实现 JSON 提取、归一化、布局、校验
7. 暴露后端路由并补测试
8. 接入前端 API client 与状态管理
9. 实现浮窗 chat UI
10. 接通执行后加载、联调与收尾

---

## 4. 具体步骤

## Step 1: 固化接口契约

目标：

- 先把会话接口和返回结构写死，避免前后端反复返工。

需要修改的文件：

- `app/src/api/contracts.ts`
- `dev_docs/workflow_agent.md`
- 可选：`dev_docs/backend_api_contract.md`

具体工作：

- 在 `contracts.ts` 中新增会话式 agent 请求/响应类型
- 补充 session state 枚举
- 补充 proposal 结构
- 补充 execute 请求里的 `proposalVersion`
- 明确错误码扩展

建议新增类型：

- `WorkflowAgentState`
- `CreateWorkflowSessionRequest`
- `CreateWorkflowSessionResponse`
- `SendWorkflowMessageRequest`
- `SendWorkflowMessageResponse`
- `ExecuteWorkflowSessionRequest`
- `ExecuteWorkflowSessionResponse`

完成标准：

- 前后端在同一份类型定义上工作
- 文档中的字段名与代码中的字段名完全一致

依赖：

- 无

## Step 2: 增加 AI 配置与 client 封装

目标：

- 把模型配置读取、client 初始化、主 agent / sub agent baseURL 区分清楚。

需要修改的文件：

- `app/package.json`
- `app/.env.example`
- `app/server/config.mjs`
- `app/server/ai/openaiClient.mjs`

具体工作：

- 安装 `openai`
- 在 `.env.example` 中补齐 AI 相关环境变量说明
- 在 `config.mjs` 中新增 `getAiConfig()`
- 在 `openaiClient.mjs` 中封装：
  - `createConversationClient()`
  - `createWorkflowJsonClient()`

推荐配置项：

- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `DEFAULT_MODEL_NAME`
- `ENABLE_THINKING`
- `DEFAULT_REASONING_EFFORT`
- `WORKFLOW_JSON_BASE_URL`
- `WORKFLOW_JSON_MODEL_NAME`

说明：

- `WORKFLOW_JSON_BASE_URL` 默认为 `https://api.deepseek.com/beta`
- `WORKFLOW_JSON_MODEL_NAME` 默认可回退到 `DEFAULT_MODEL_NAME`

完成标准：

- 服务端可独立创建主 agent client 和 sub agent client
- 缺少关键环境变量时可明确报错

依赖：

- Step 1

## Step 3: 实现会话存储与状态机

目标：

- 管住 session 生命周期和“未确认不可执行”这条底线。

需要新增的文件：

- `app/server/ai/workflowSessionStore.mjs`

具体工作：

- 实现内存级 session store
- session 至少保存：
  - `sessionId`
  - `messages`
  - `state`
  - `proposal`
  - `proposalVersion`
  - `locale`
  - `themePresetId`
  - `createdAt`
  - `updatedAt`
- 提供以下方法：
  - `createSession()`
  - `getSession()`
  - `appendMessage()`
  - `setProposal()`
  - `markAwaitingExecution()`
  - `markExecuting()`
  - `markCompleted()`
  - `clearExpiredSessions()`

状态建议：

- `collecting_requirements`
- `awaiting_execution_confirmation`
- `executing`
- `completed`
- `error`

必须落实的规则：

- 非 `awaiting_execution_confirmation` 状态禁止执行
- 每次新提案都要 `proposalVersion + 1`
- 用户在等待执行阶段继续修改需求后，要回到新一轮提案确认

完成标准：

- 用纯单元测试可覆盖状态切换
- 可阻止旧版 proposal 被误执行

依赖：

- Step 1

## Step 4: 实现主 agent 对话编排

目标：

- 让 agent 能多轮理解需求，并在合适时机产出“待执行提案”。

需要新增的文件：

- `app/server/ai/workflowConversationPrompt.mjs`
- `app/server/ai/workflowConversationAgent.mjs`

具体工作：

- 编写主 agent system prompt
- 约束主 agent 返回结构化 JSON，而不是自由文本
- 主 agent 每轮返回：
  - `reply`
  - `state`
  - `canExecute`
  - `proposal.title`
  - `proposal.summary`
- 在 `workflowConversationAgent.mjs` 中实现：
  - 把 session 历史转成 messages
  - 调用模型
  - 解析模型结构化结果
  - 写回 session store

实现建议：

- 不要让主 agent 直接生成 `Diagram`
- 主 agent 的目标只是“理解需求 + 形成最终自然语言方案”
- 若模型只返回文本，不返回结构化包裹，应视为解析失败

完成标准：

- 用户输入需求后，服务端能返回一条自然语言回复
- 若用户继续补充需求，主 agent 能更新 proposal
- 当主 agent 进入 `awaiting_execution_confirmation` 时，`canExecute=true`

依赖：

- Step 2
- Step 3

## Step 5: 实现 sub agent JSON 生成

目标：

- 在用户确认后，将最终自然语言方案转换成 fenced JSON 文本。

需要新增的文件：

- `app/server/ai/workflowJsonPrompt.mjs`
- `app/server/ai/workflowJsonSubAgent.mjs`

具体工作：

- 编写 sub agent system prompt
- 构建最终 user prompt，包含：
  - proposal summary
  - locale
  - theme preset
  - schema 约束
  - 节点类型、边类型限制
- 使用前缀续写方式调用模型
- 封装 `generateWorkflowJsonText()` 方法

关键实现点：

- `assistant.prefix = true`
- `assistant.content = '```json\n'`
- `stop: ['```']`

sub agent 输出要求：

- 只负责生成 JSON 文本
- 不负责对话
- 不负责最终状态机

完成标准：

- 给定固定 proposal，sub agent 可返回 JSON 字符串正文
- 输出异常时能清晰抛出 `AI_RESPONSE_INVALID`

依赖：

- Step 2
- Step 4

## Step 6: 实现 JSON 提取、归一化、布局与校验

目标：

- 把 sub agent 的输出收敛成项目真正能加载的 `Diagram`。

需要新增的文件：

- `app/server/ai/diagramNormalizer.mjs`
- `app/server/ai/diagramLayout.mjs`
- 可选：`app/server/ai/jsonFenceParser.mjs`

建议复用的现有文件：

- `app/server/schema.mjs`
- `app/src/data/themePresets.ts`
- `app/src/utils/geometry.ts`

具体工作：

- 从 fenced block 中提取 JSON
- `JSON.parse()`
- 若缺失或非法：
  - 修正 id
  - 修正 lane order
  - 修正非法 laneId
  - 过滤非法 edge
  - 用 preset 覆盖 `theme`
- 对 nodes 应用确定性布局
- 最终调用 `assertDiagramPayload()`

说明：

- v1 可接受 sub agent 直接生成接近最终结构的 JSON
- 但程序层必须拥有兜底修正能力
- 不允许把未经服务端校验的模型结果直接返回给前端

完成标准：

- 任意一次成功执行都能返回合法 `Diagram`
- 返回对象可被前端现有导入链路接受

依赖：

- Step 5

## Step 7: 实现执行服务与后端路由

目标：

- 把“创建会话 / 发送消息 / 执行”三段能力暴露成稳定接口。

需要新增或修改的文件：

- `app/server/ai/workflowExecutionService.mjs`
- `app/server/index.mjs`

具体工作：

- `workflowExecutionService.mjs` 负责串起：
  - session store
  - 主 agent
  - sub agent
  - normalizer
- 暴露三个核心方法：
  - `createWorkflowSession()`
  - `sendWorkflowMessage()`
  - `executeWorkflowSession()`
- 在 `index.mjs` 新增路由：
  - `POST /api/ai/workflow/sessions`
  - `POST /api/ai/workflow/sessions/:sessionId/messages`
  - `POST /api/ai/workflow/sessions/:sessionId/execute`

必须落实的接口规则：

- 空消息返回 `400`
- 找不到 session 返回 `404`
- 未到待执行状态返回 `409`
- `proposalVersion` 不匹配返回 `409`
- 执行期间重复请求返回 `409`

完成标准：

- 后端可独立通过 curl 或手工请求跑通完整链路
- 会话状态和错误码符合文档定义

依赖：

- Step 3
- Step 4
- Step 5
- Step 6

## Step 8: 补服务端测试

目标：

- 在接前端之前，把后端链路先压稳定。

建议新增的测试文件：

- `app/server/ai/workflowSessionStore.test.mjs`
- `app/server/ai/workflowConversationAgent.test.mjs`
- `app/server/ai/workflowJsonSubAgent.test.mjs`
- `app/server/ai/workflowExecutionService.test.mjs`
- `app/server/ai/diagramNormalizer.test.mjs`

重点测试用例：

- session 创建成功
- 主 agent 两轮对话后进入待执行状态
- 用户修改需求后 `proposalVersion` 递增
- 未确认时执行失败
- 旧 proposalVersion 执行失败
- sub agent 非法 JSON 触发错误
- JSON 归一化后通过 `assertDiagramPayload()`

完成标准：

- 后端核心逻辑具备自动化覆盖
- 能在不启动前端的情况下验证执行主链路

依赖：

- Step 7

## Step 9: 接入前端 API client 与页面状态

目标：

- 让前端能管理会话、消息列表、执行状态，但暂时不追求最终 UI 精修。

需要修改的文件：

- `app/src/api/contracts.ts`
- `app/src/api/client.ts`
- `app/src/App.tsx`

具体工作：

- 在 `client.ts` 中新增：
  - `createWorkflowSession()`
  - `sendWorkflowMessage()`
  - `executeWorkflowSession()`
- 在 `App.tsx` 中新增 agent 相关状态：
  - `isAgentOpen`
  - `agentSessionId`
  - `agentMessages`
  - `agentState`
  - `agentProposal`
  - `isAgentLoading`
  - `isAgentExecuting`
- 封装事件：
  - `handleOpenAgent()`
  - `handleCloseAgent()`
  - `handleSendAgentMessage()`
  - `handleExecuteAgentProposal()`

实现建议：

- 第一次打开浮窗时创建 session
- 会话 id 保存在内存状态即可
- v1 先不做刷新恢复

完成标准：

- 前端能成功请求会话接口
- 前端能正确感知 `canExecute` 与当前 proposal

依赖：

- Step 1
- Step 7

## Step 10: 实现浮窗 chat UI

目标：

- 完成用户可见的对话入口与执行交互。

需要新增或修改的文件：

- `app/src/components/agent/WorkflowAgentLauncher.tsx`
- `app/src/components/agent/WorkflowAgentWindow.tsx`
- `app/src/components/agent/WorkflowChatMessageList.tsx`
- `app/src/components/toolbar/Toolbar.tsx`
- `app/src/styles/editor.css`
- `app/src/i18n/zh-CN.ts`
- `app/src/i18n/en-US.ts`
- `app/src/i18n/index.ts`

具体工作：

- 新增悬浮按钮
- 新增浮窗容器
- 渲染消息列表
- 渲染输入框和发送按钮
- 在 `canExecute=true` 时显示执行按钮
- 在执行中显示 loading 状态
- 在错误时显示失败提示

UI 最小要求：

- 浮窗可打开、关闭、最小化
- 可以看到用户消息和 agent 回复
- 可以明显识别“当前提案待执行”
- 执行按钮不能在错误状态或加载状态下误触发

完成标准：

- 用户从页面上可完整使用 agent，无需开发者工具辅助

依赖：

- Step 9

## Step 11: 接通“执行后加载 workflow”

目标：

- 让“执行”真正生效，而不是只停在 chat 返回。

需要修改的文件：

- `app/src/App.tsx`
- 可选：`app/src/storage/persistenceService.ts`

具体工作：

- 在执行成功回调中拿到 `diagram`
- 本地模式下直接 `replace-diagram`
- 远端模式下调用 `persistenceService.importDiagram({ diagram })`
- 成功后追加一条系统消息，例如：
  - “已生成并加载到当前 workflow”
- 若远端导入失败，要显示错误并保持 chat 状态可恢复

完成标准：

- 点击执行后，画布内容可见变化
- 远端模式下 revision 列表能看到导入记录

依赖：

- Step 10

## Step 12: 联调、验收与收尾

目标：

- 做最后一轮真实场景验证，把遗漏的边角问题收掉。

建议验证场景：

- 场景 1：用户一句话直接生成简单流程
- 场景 2：用户两轮修改后再执行
- 场景 3：用户在待执行状态下继续修改，旧 proposal 失效
- 场景 4：远端模式执行导入
- 场景 5：sub agent 返回非法 JSON 的报错体验
- 场景 6：节点数量较多时布局仍可阅读

建议命令：

- `cd app && npm run test`
- `cd app && npm run build`
- 如有必要再补：`cd app && npm run lint`

完成标准：

- 功能闭环成立
- 无明显阻断级错误
- 文档与代码契约一致

依赖：

- Step 11

---

## 5. 每一步的交付物

按步骤完成后，仓库中应逐步出现以下核心产物：

- Step 1: agent 会话接口类型定义
- Step 2: AI 配置与 client 封装
- Step 3: session store 与状态机
- Step 4: 主 agent 对话编排
- Step 5: sub agent prefix JSON 生成器
- Step 6: normalizer / layout / schema 校验链
- Step 7: 可调用的后端 HTTP 接口
- Step 8: 服务端自动化测试
- Step 9: 前端 agent 状态管理
- Step 10: 浮窗 chat UI
- Step 11: 执行后自动加载 workflow
- Step 12: 联调、验收与清理

## 6. 推荐开发批次

如果按 PR 或 commit 分批，建议这样切：

### Batch A: 后端协议与基础设施

- Step 1
- Step 2
- Step 3

### Batch B: 后端主链路

- Step 4
- Step 5
- Step 6
- Step 7
- Step 8

### Batch C: 前端接入

- Step 9
- Step 10
- Step 11

### Batch D: 联调与加固

- Step 12

## 7. 开发时的注意事项

- 不要让前端直接接触模型 API key。
- 不要让主 agent 直接输出最终 `Diagram`。
- 不要信任 sub agent 返回的任意字段，必须经过服务端校验。
- 不要把“发送执行”做成单纯文本判断，前端按钮和后端状态机都要存在。
- 不要忽略 `proposalVersion`，这是避免误执行旧提案的关键。
- 不要绕开现有 `importDiagram()`，远端模式必须复用当前版本管理能力。

## 8. 建议的开工顺序

如果现在立刻开始开发，建议就按下面的顺序开工：

1. 先改 `app/src/api/contracts.ts`
2. 再补 `app/server/config.mjs` 和 `app/server/ai/openaiClient.mjs`
3. 写 `workflowSessionStore.mjs`
4. 写 `workflowConversationPrompt.mjs` 和 `workflowConversationAgent.mjs`
5. 写 `workflowJsonPrompt.mjs` 和 `workflowJsonSubAgent.mjs`
6. 写 `diagramNormalizer.mjs` / `diagramLayout.mjs`
7. 写 `workflowExecutionService.mjs`
8. 把路由接进 `app/server/index.mjs`
9. 先补服务端测试
10. 再做前端浮窗和交互接入

这条顺序的核心是：先保证后端“能聊、能确认、能执行、能返回合法 Diagram”，再去做用户界面。
