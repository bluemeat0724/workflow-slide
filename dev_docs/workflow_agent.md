# Workflow Agent 开发与集成计划

## 1. 目标

建设一个服务端 AI agent，接收用户自然语言需求，生成**可直接导入当前项目**的工作流 JSON。

v1 目标：

- 页面提供可打开的浮窗 chat 界面
- agent 支持多轮对话，逐步理解用户需求与意图
- agent 先用自然语言总结将生成的 workflow，再请求用户确认执行
- 只有用户明确输入“执行”或点击确认执行后，才真正生成并加载 workflow
- 输入一段文本需求，最终输出符合当前 `Diagram` 结构的 JSON
- 输出结果可通过现有前端 `parseDiagramJson()` 校验
- 输出结果可通过现有后端 `assertDiagramPayload()` 校验
- 前端可将执行结果直接加载到当前画布
- 远端文档模式下，沿用现有 `importDiagram()` 流程，保留 revision 历史

v1 非目标：

- 不做通用聊天助手平台
- 不做多模型编排或外部知识库检索
- 不让模型直接决定完整主题 CSS 细节
- 不让模型直接决定最终坐标，避免不稳定布局

## 2. 当前项目事实

基于现有代码，AI 生成能力必须服从以下约束：

- 导入 JSON 的真实目标结构是 `app/src/model/diagram.ts` 中的 `Diagram`
- 前端导入校验在 `app/src/utils/json.ts`
- 后端入库校验在 `app/server/schema.mjs`
- 本地/远端导入入口已经存在于 `app/src/App.tsx`
- 远端导入已走 `persistenceService.importDiagram()`，并会调用 `POST /api/diagrams/:diagramId/import`
- 主题字段是完整对象，且包含 `boardBackground` / `laneBackground` 等 CSS 值
- 节点坐标使用百分比布局，并受 `app/src/utils/geometry.ts` 的边界规则约束

直接让模型一次性吐出最终 `Diagram` 风险较高，主要问题有：

- 容易漏字段或返回 Markdown 包裹
- 容易生成非法 `theme`
- 容易生成重叠或越界坐标
- 容易生成无效 edge 引用

因此 v1 应采用“**模型生成语义草稿，程序确定性补全最终 JSON**”的方案。

## 3. 总体方案

agent 仍然放在服务端实现，但前端交互从“单次表单生成”升级为“浮窗多轮对话”。

原因：

- `.env` 中已有模型配置，密钥不应暴露到浏览器
- 多轮对话需要服务端管理会话状态、执行闸门和模型上下文
- 当前后端已承担导入前的最终结构校验，更适合作为 AI 输出的守门人
- 后续如果需要限流、日志、审计、会话回放，都应放在服务端

整体链路拆成两个阶段：

### 3.1 对话阶段

1. 页面右下角浮窗打开 agent chat
2. 用户输入 workflow 需求
3. 主 agent 基于多轮对话理解目标、补齐缺失信息、接受修改意见
4. 当信息足够时，主 agent 输出一版**自然语言 workflow 描述**
5. 主 agent 明确询问用户“是否执行”
6. 如果用户继续补充或调整，主 agent 更新描述并再次请求确认

### 3.2 执行阶段

1. 只有当用户明确回复“执行”或点击确认执行后，后端才允许进入执行
2. 主 agent 将最终自然语言 workflow 规格传给 sub agent
3. sub agent 使用“对话前缀续写”方式调用模型，生成 fenced JSON 文本
4. 服务端提取 fenced block 中的 JSON 数据
5. 服务端将 JSON 转换、归一化、布局、校验为最终 `Diagram`
6. 前端收到结果后直接加载到当前 workflow
7. 若当前是远端文档，继续走现有 `importDiagram()`，保留 `source=import` revision

结论：

- 主 agent 负责“理解需求、讨论方案、请求确认”
- sub agent 负责“把最终方案转换成 JSON 文本”
- 程序层负责“提取、修复、校验、加载”

## 4. Agent 角色拆分

v1 建议采用 4 层职责，而不是单模型一次性完成全部工作。

### 4.1 会话管理层

职责：

- 为每次 chat 创建 `sessionId`
- 保存消息历史、当前提案摘要、是否允许执行
- 阻止未确认时的直接执行
- 管理会话超时与清理

建议文件：

- `app/server/ai/workflowSessionStore.mjs`

### 4.2 主 agent

职责：

- 与用户多轮对话
- 理解 workflow 目标、参与者、输入输出、泳道划分、关键节点和连接关系
- 当信息不充分时主动追问
- 当信息足够时输出一版自然语言 workflow 描述
- 自行决定当前是否达到可执行状态
- 达到可执行状态后，明确向用户请求执行确认
- 在用户修改要求后，重新整理并输出更新后的自然语言描述

主 agent 的关键约束：

- 不直接输出最终 JSON
- 不在未经确认前触发生成
- 每次准备执行前，都要给出一段可读的最终方案摘要

建议文件：

- `app/server/ai/workflowConversationAgent.mjs`

### 4.3 JSON 生成 sub agent

职责：

- 接收主 agent 输出的最终 workflow 规格
- 不再与用户对话
- 使用前缀续写的方式生成 fenced JSON 文本
- 尽量保证结果接近项目需要的结构

建议输出形式：

```json
{
  "meta": {},
  "theme": {},
  "lanes": [],
  "nodes": [],
  "edges": []
}
```

在模型调用层面，sub agent 的实际输出应包裹在 `json fenced code block` 中，服务端再从 fenced block 中提取 JSON 数据。

建议文件：

- `app/server/ai/workflowJsonSubAgent.mjs`

### 4.4 确定性后处理层

职责：

- 解析 sub agent 输出的 JSON 文本
- 生成或修正 `lane-*` / `node-*` / `edge-*` id
- 补齐或覆盖 theme
- 必要时修正坐标、尺寸、边引用
- 最终走 `assertDiagramPayload()` 做强校验

建议文件：

- `app/server/ai/diagramNormalizer.mjs`
- `app/server/ai/diagramLayout.mjs`

## 5. 外部接口设计

前端不再直接只有一个 `generate` 接口，而是改为“chat + execute”双阶段。

### 5.1 创建会话

`POST /api/ai/workflow/sessions`

请求体建议：

```ts
type CreateWorkflowSessionRequest = {
  locale?: 'zh-CN' | 'en-US'
  themePresetId?: 'accenture-purple' | 'lenovo-red' | 'pfizer-blue'
}
```

响应体建议：

```ts
type CreateWorkflowSessionResponse = {
  ok: true
  sessionId: string
  welcomeMessage: string
}
```

### 5.2 发送用户消息

`POST /api/ai/workflow/sessions/:sessionId/messages`

请求体建议：

```ts
type SendWorkflowMessageRequest = {
  message: string
}
```

响应体建议：

```ts
type SendWorkflowMessageResponse = {
  ok: true
  reply: {
    role: 'assistant'
    content: string
  }
  state: 'collecting_requirements' | 'awaiting_execution_confirmation'
  canExecute: boolean
  proposal?: {
    version: number
    title: string
    summary: string
  }
}
```

设计要点：

- `state=collecting_requirements` 表示仍在沟通中
- `state=awaiting_execution_confirmation` 表示主 agent 已给出方案，等待用户确认
- 只有 `canExecute=true` 时，前端才展示或启用“执行”按钮

### 5.3 执行生成

`POST /api/ai/workflow/sessions/:sessionId/execute`

请求体建议：

```ts
type ExecuteWorkflowSessionRequest = {
  confirmed: true
  proposalVersion: number
}
```

响应体建议：

```ts
type ExecuteWorkflowSessionResponse = {
  ok: true
  diagram: Diagram
  summary: string
  warnings: string[]
  meta: {
    model: string
    sessionId: string
    generator: 'sub-agent-prefix'
    normalized: true
  }
}
```

执行闸门要求：

- 如果当前 session 未进入 `awaiting_execution_confirmation`，接口返回 `409`
- 如果请求体未显式 `confirmed: true`，接口返回 `400`
- 如果 `proposalVersion` 与当前待执行提案版本不一致，接口返回 `409`
- 执行成功后，当前 session 进入 `completed` 或 `idle-with-last-result`

### 5.4 可选补充接口

如需要更完整体验，可追加：

- `GET /api/ai/workflow/sessions/:sessionId`
- `DELETE /api/ai/workflow/sessions/:sessionId`

### 5.5 错误语义建议

- `400`：请求体非法、空消息、未确认执行
- `404`：session 不存在
- `409`：当前状态不允许执行
- `500`：服务端配置缺失
- `502`：模型返回不可解析或上游异常
- `504`：模型超时

如需扩展 `ApiErrorCode`，建议新增：

- `AI_CONFIG_MISSING`
- `AI_UPSTREAM_ERROR`
- `AI_RESPONSE_INVALID`
- `AI_TIMEOUT`
- `AI_SESSION_NOT_FOUND`
- `AI_EXECUTION_NOT_CONFIRMED`

## 6. 模型调用策略

参考 `dev_docs/call_model.md`，服务端直接使用 OpenAI SDK，但区分主 agent 和 sub agent 两种调用方式。

建议新增依赖：

- `openai`

建议配置来源：

- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `DEFAULT_MODEL_NAME`
- `ENABLE_THINKING`
- `DEFAULT_REASONING_EFFORT`

建议在 `app/server/config.mjs` 中新增：

- `getAiConfig()`
- `getWorkflowJsonGeneratorBaseUrl()`

其中：

- 主 agent 默认使用 `OPENAI_API_BASE`
- sub agent 若采用 DeepSeek prefix 续写，建议使用 `https://api.deepseek.com/beta`

### 6.1 主 agent 调用方式

主 agent 使用常规 chat completion，多轮维护消息历史。

基础调用建议：

```js
const completion = await openai.chat.completions.create({
  model,
  messages,
  thinking: enableThinking ? { type: 'enabled' } : undefined,
  reasoning_effort: reasoningEffort,
  stream: false,
})
```

主 agent 产物不是 JSON，而是：

- 对用户的自然语言回复
- 当前是否可执行
- 当前提案摘要

### 6.2 sub agent 调用方式

sub agent 专门负责 JSON 生成，采用你提供的“对话前缀续写”方案。

建议流程：

1. 主 agent 先产出最终自然语言 workflow 规格
2. 服务端将该规格拼接成 sub agent 的 user prompt
3. sub agent 使用 beta baseURL 调用模型
4. 通过 `assistant.prefix = true` 让模型从 JSON 代码块起始标记之后续写
5. 通过 `stop: ['```']` 截断输出
6. 服务端重建 fenced 文本并提取 JSON

建议调用形式：

```js
const messages = [
  { role: 'system', content: 'You generate workflow JSON only.' },
  { role: 'user', content: subAgentPrompt },
  { role: 'assistant', content: '```json\n', prefix: true },
]

const response = await client.chat.completions.create({
  model,
  messages,
  stop: ['```'],
})
```

服务端处理建议：

- 原始模型结果记为 `jsonBody`
- 重建成完整的 fenced JSON 文本
- 从 fenced block 中提取正文
- `JSON.parse()` 解析
- 若解析失败，按固定次数重试

建议结论：

- 主 agent 负责对话理解
- sub agent 负责结构化输出
- prefix 续写是 sub agent 的默认方案，而不是可选增强

## 7. Prompt 设计

Prompt 设计要拆成主 agent prompt 和 sub agent prompt，两者职责必须分离。

### 7.1 主 agent prompt

系统提示词应明确以下规则：

- 你是一个 workflow 设计 agent，不是 JSON 生成器
- 你必须通过多轮对话理解需求
- 当信息不足时可以追问，但追问应尽量聚焦
- 当信息足够时，你要用自然语言总结 workflow
- 总结内容至少包括：泳道、关键节点、主要连接关系、最终输出
- 在用户明确确认前，你不能执行生成
- 每次准备执行前，必须显式询问“是否执行”
- 如果用户提出修改，你要更新 workflow 描述后再次请求确认

主 agent 返回建议采用结构化包裹，便于程序判断状态，例如：

```json
{
  "reply": "我建议将该 RAG workflow 分为数据准备、索引构建、检索增强、答案生成四个泳道……请问是否执行？",
  "state": "awaiting_execution_confirmation",
  "proposal": {
    "title": "RAG 工作流",
    "summary": "..."
  }
}
```

这样可以避免后端仅靠自然语言猜状态。

### 7.2 sub agent prompt

sub agent 的系统提示词应明确以下规则：

- 你只输出 workflow JSON
- 输出放在 fenced `json` 代码块中
- 不输出解释、注释或多余文本
- 必须符合当前项目的数据结构约束
- `meta.locale` 只能是 `zh-CN` 或 `en-US`
- `node.type` 只能是 `default | agent | shared | output`
- `edge.emphasis` 只能是 `soft | theme`
- `lanes` 至少一条

sub agent 的 user prompt 应包含：

- 主 agent 最终确认版的自然语言 workflow 摘要
- 目标语言
- 主题预设 id
- 节点数量建议上限
- 当前项目 schema 关键约束

建议将 prompt 构造提取到：

- `app/server/ai/workflowConversationPrompt.mjs`
- `app/server/ai/workflowJsonPrompt.mjs`

## 8. 归一化与布局规则

### 8.1 主题规则

不要让模型生成完整 `theme`。

程序侧处理：

- `themePresetId` 有值时使用对应预设
- 否则默认 `accenture-purple`
- 主题来源直接复用 `app/src/data/themePresets.ts` 的字段结构

### 8.2 ID 规则

程序统一生成：

- lane: `lane-1`, `lane-2`, ...
- node: `node-1`, `node-2`, ...
- edge: `edge-1`, `edge-2`, ...

模型只输出可读 `key`，程序建立 `key -> id` 映射。

### 8.3 布局规则

建议采用确定性网格布局，而不是让模型猜坐标。

基础规则：

- lane 顺序取数组顺序，`order` 从 `0` 递增
- 每个 lane 内节点按声明顺序布局
- 默认节点宽高可从 `18 x 18` 起步
- 单泳道节点较多时自动分两行
- 最终统一调用 `constrainNodeToLane()` 做边界收敛

建议布局策略：

- `1-3` 个节点：单行均匀铺开
- `4-6` 个节点：单行压缩宽度
- `7+` 个节点：两行布局，保持左到右阅读顺序

边规则：

- edge 仅允许引用已存在的 node key
- 自环 edge 直接丢弃
- 缺省 `emphasis` 默认给 `theme`

### 8.4 最终校验

生成最终 `Diagram` 后，必须经过：

1. `assertDiagramPayload()` 服务端强校验
2. 可选再跑一次前端同等 JSON round-trip 测试

任何校验失败都不能直接返回给前端作为可导入结果。

## 9. 前端集成与交互方案

前端应提供一个可随时打开的浮窗 chat，而不是一次性表单。

### 9.1 浮窗形态

建议采用页面右下角悬浮入口：

- 默认显示一个悬浮按钮，例如 “AI”
- 点击后打开浮窗 chat window
- 浮窗支持最小化、关闭、保留消息历史
- 浮窗内展示对话记录、输入框、发送按钮、执行按钮

v1 可以先做固定位置浮窗，不必一开始就支持拖拽。

### 9.2 浮窗内交互状态

浮窗至少包含以下状态：

- `collecting_requirements`：正在沟通需求
- `awaiting_execution_confirmation`：已形成方案，等待用户确认执行
- `executing`：已确认，正在调用 sub agent 生成 JSON
- `completed`：已生成并加载到当前 workflow
- `error`：生成失败或解析失败

推荐交互规则：

- `collecting_requirements` 时，主操作是“发送”
- `awaiting_execution_confirmation` 时，主操作变为“执行”
- 用户仍可继续输入调整要求，执行按钮此时对应当前 `proposalVersion`
- 如果用户在该状态下直接发送“执行”，前端可直接映射为 `execute` 接口调用
- `executing` 时禁用输入和执行按钮，避免并发请求

### 9.3 执行后的加载行为

执行确认通过后：

- 本地模式：直接 `dispatch({ type: 'replace-diagram', diagram })`
- 远端模式：走 `persistenceService.importDiagram({ diagram })`

这里“执行”就等于“生成并加载到当前画布”，不再要求用户做第二次应用确认。

### 9.4 参考场景

建议将以下交互固化为文档级 example：

用户：生成一幅 rag 工作流  
agent：我建议将该 workflow 拆成数据接入、文档切分与向量化、检索、答案生成四个泳道。关键节点包括知识库导入、切片与 embedding、向量索引、query 改写、召回、重排、LLM 生成和最终回复输出。请问是否执行？  
用户：把 query 改写和重排放到同一个泳道，并增加一个人工反馈节点  
agent：调整后 workflow 将分为数据接入、索引构建、检索增强、生成与反馈四个泳道。其中检索增强泳道包含 query 改写、召回、重排；生成与反馈泳道包含答案生成、人工反馈、结果输出。请问是否执行？  
用户：执行  
agent：已确认执行，下面将按当前版本生成最终 workflow JSON。  
sub agent：基于最终自然语言规格，用对话前缀续写方式生成 fenced JSON 文本  
system：提取 json data，归一化校验后加载到应用 workflow

### 9.5 建议前端文件改动

- `app/src/api/contracts.ts`
- `app/src/api/client.ts`
- `app/src/App.tsx`
- `app/src/components/toolbar/Toolbar.tsx`
- `app/src/components/agent/WorkflowAgentLauncher.tsx`
- `app/src/components/agent/WorkflowAgentWindow.tsx`
- `app/src/components/agent/WorkflowChatMessageList.tsx`
- `app/src/i18n/zh-CN.ts`
- `app/src/i18n/en-US.ts`
- `app/src/i18n/index.ts`

说明：

- `Toolbar.tsx` 不一定承担主入口，只需保留可选入口或状态提示
- 真正的主入口更适合通过悬浮按钮挂在 `App.tsx`

## 10. 后端改动清单

建议新增/修改如下文件：

- `app/package.json`
- `app/.env.example`
- `app/server/config.mjs`
- `app/server/index.mjs`
- `app/server/ai/openaiClient.mjs`
- `app/server/ai/workflowSessionStore.mjs`
- `app/server/ai/workflowConversationAgent.mjs`
- `app/server/ai/workflowJsonSubAgent.mjs`
- `app/server/ai/workflowConversationPrompt.mjs`
- `app/server/ai/workflowJsonPrompt.mjs`
- `app/server/ai/workflowExecutionService.mjs`
- `app/server/ai/diagramNormalizer.mjs`
- `app/server/ai/diagramLayout.mjs`

建议在 `index.mjs` 中保持当前风格，先增量加入路由，不强制先做大重构。

## 11. 测试计划

### 11.1 单元测试

优先测试纯函数模块：

- 主 agent prompt 构造
- sub agent prompt 构造
- session 状态流转
- JSON fenced block 提取
- 中间结构到 `Diagram` 的转换
- 布局算法
- 无效 edge 过滤
- 默认主题补全

建议新增：

- `app/server/ai/workflowExecutionService.test.mjs`
- `app/server/ai/diagramNormalizer.test.mjs`

### 11.2 接口测试

mock OpenAI client，验证：

- 创建 session 成功
- 多轮发送消息后进入 `awaiting_execution_confirmation`
- 未确认时调用 `execute` 返回 `409`
- `proposalVersion` 不匹配时返回 `409`
- 确认执行后返回可导入 `Diagram`
- sub agent 返回非法 JSON 时得到 `502`
- 模型超时时得到 `504`

### 11.3 前端联调

验证以下场景：

- 页面浮窗可正常打开、关闭、最小化
- 用户可进行至少两轮对话
- agent 在形成方案前不会出现“执行”态
- 用户调整需求后，proposal 文本和 `proposalVersion` 会刷新
- 用户确认执行后，workflow 成功加载到本地画布
- 远端画布生成并触发 `import` revision
- 生成失败时状态提示正确
- 执行过程中重复点击被拦截

建议最小验证命令：

- `cd app && npm run test`
- `cd app && npm run build`

如果新增了 lint 敏感代码，再补：

- `cd app && npm run lint`

## 12. 分阶段实施

### Phase 1: 后端会话式 agent 骨架

交付内容：

- OpenAI 兼容模型接入
- session store
- `POST /api/ai/workflow/sessions`
- `POST /api/ai/workflow/sessions/:id/messages`
- `POST /api/ai/workflow/sessions/:id/execute`
- 主 agent 与 sub agent 的基础 prompt
- prefix 续写生成 + fenced JSON 提取

验收标准：

- 后端可完整跑通“对话 -> 待确认 -> 执行 -> 返回 Diagram”
- 未确认时无法执行

### Phase 2: 前端浮窗 chat 接入

交付内容：

- 页面右下角悬浮入口
- chat 浮窗
- 会话消息渲染
- 执行按钮状态控制
- 执行成功后自动加载 workflow
- 远端导入复用现有 persistence

验收标准：

- 用户可在 UI 中完成多轮沟通并执行生成，无需手动处理 JSON

### Phase 3: 稳定性与体验增强

交付内容：

- proposalVersion 并发保护
- JSON 解析失败重试
- warnings 展示
- 执行中的 loading 与禁用控制
- 节点数量过多时的布局优化
- 会话超时与恢复策略

验收标准：

- 常见业务流程描述下，生成成功率、交互稳定性和可读性达到可用水平

## 13. 风险与对应措施

风险：主 agent 过早执行  
措施：执行接口必须由服务端状态机控制，仅 `awaiting_execution_confirmation` 可执行

风险：用户修改需求后误执行旧提案  
措施：每次形成新提案都递增 `proposalVersion`，执行时强制校验版本一致

风险：sub agent 输出 fenced JSON 不完整  
措施：统一做 fenced block 重建、提取、`JSON.parse()` 校验和有限次重试

风险：节点布局拥挤或越界  
措施：坐标由程序生成，并统一走 `constrainNodeToLane()`

风险：主题字段非法  
措施：主题完全由程序从 preset 生成，不依赖模型自由输出

风险：远端文档执行后覆盖用户草稿  
措施：执行前必须明确确认；执行时继续走现有 `importDiagram()` 乐观锁和 revision 机制

风险：会话状态丢失  
措施：v1 可先采用内存会话并设置过期时间；若后续需求增强，再升级到持久化会话

## 14. 建议的首个实施版本

为了尽快落地，建议按下面的最小闭环实现：

1. 服务端新增 session / messages / execute 三个接口
2. 主 agent 负责多轮对话与执行确认
3. sub agent 使用 prefix 续写生成 fenced JSON
4. 服务端提取并校验 JSON，转换为最终 `Diagram`
5. 前端新增右下角浮窗 chat
6. 用户确认“执行”后直接加载到当前 workflow

这个版本已经满足你提出的关键交互要求：

- 页面可通过浮窗打开与 agent 进行 chat
- agent 支持多轮对话理解需求
- agent 自行决定何时进入待执行状态
- 执行前必须经用户确认
- 确认后由 sub agent 生成 JSON 文本并加载到应用 workflow

## 15. 后续可选增强

- 支持“基于当前图继续改写”
- 支持“撤销上一次 AI 执行”
- 支持将主 agent 的自然语言摘要保存到 revision 说明
- 支持输出多套候选 workflow 方案供用户选择
- 支持会话跨刷新恢复
- 支持行业模板或示例 few-shot
- 支持按语言自动优化 lane subtitle
