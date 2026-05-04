# 代码审查与优化建议

> 审查范围：自上次 commit 以来的所有修改和新增文件（`git status --porcelain` 共 32 个变更文件 + 6 个新目录）。
> 审查日期：2026-05-04
> Lint: 2 errors | Test: 49 passed | Build: passes

---

## 一、严重问题（必须修复）

### 1. React Hooks 规则违规 —— WorkflowAgentWindow.tsx

**文件**：[WorkflowAgentWindow.tsx](file:///Users/g-air/projects/workflow-slide/app/src/components/agent/WorkflowAgentWindow.tsx#L44-L52)

**问题**：`useRef` 和 `useEffect` 在早期 return 之后调用，违反 React Hooks 必须在组件顶层且每次渲染顺序一致的规则。这会导致渲染异常和潜在的运行时错误。

```tsx
// 当前代码（有 bug）
export function WorkflowAgentWindow({ isOpen, ... }: WorkflowAgentWindowProps) {
  if (!isOpen) {       // 第 44 行：早期 return
    return null
  }
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)  // bug: hook 在 return 之后
  // ...
  useEffect(() => { ... })  // bug: hook 在 return 之后
```

**修复方案**：将 hooks 移至 return 之前。

```tsx
export function WorkflowAgentWindow({ isOpen, ... }: WorkflowAgentWindowProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const isBusy = isAgentLoading || isAgentExecuting
  const canExecute = agentState === 'awaiting_execution_confirmation' && Boolean(agentProposal) && !isBusy
  const isEmptyState = agentMessages.length === 0 && !agentProposal && !agentError

  useEffect(() => {
    if (!isOpen || !sessionReady || isBusy) return
    textareaRef.current?.focus()
  }, [isBusy, isOpen, sessionReady])

  if (!isOpen) {
    return null
  }
  // ...
```

---

## 二、高优先级优化

### 2. App.tsx 单体组件过大（1200+ 行）

**文件**：[App.tsx](file:///Users/g-air/projects/workflow-slide/app/src/App.tsx)

**问题**：本文件承载了过多职责：
- 编辑器状态管理（reducer dispatch）
- 持久化服务初始化（persistenceService）
- AI Agent 会话管理（createSession / sendMessage / execute）
- Agent Launcher 拖拽定位（window event listeners）
- 图库列表/搜索/翻页
- 导入导出 JSON/HTML
- 远程文档创建/删除/恢复

**建议**：将 Agent 相关逻辑（约 400 行）抽取为自定义 Hook：

```ts
// app/src/hooks/useWorkflowAgent.ts
export function useWorkflowAgent(api: DiagramApiClient | null, diagram: Diagram, ...) {
  // agentSessionId, agentMessages, agentState, agentProposal,
  // isAgentLoading, isAgentExecuting, agentError,
  // handleOpenAgent, handleCloseAgent, handleSendAgentMessage,
  // handleExecuteAgentProposal
  return { ... }
}
```

同样，可将拖拽逻辑抽取为 `useDraggableLauncher`，将图库管理抽取为 `useDiagramLibrary`。

**效果**：App.tsx 可从 1200 行减少到约 500 行，职责更清晰，便于测试和维护。

### 3. 主题预设数据在前端和后端重复定义

**文件**：
- 前端：[themePresets.ts](file:///Users/g-air/projects/workflow-slide/app/src/data/themePresets.ts)
- 后端：[serverThemePresets.mjs](file:///Users/g-air/projects/workflow-slide/app/server/ai/serverThemePresets.mjs)

**问题**：两处有相同的 7 组预设定义（violet, crimson, azure, amber, graphite, aqua, teal）。新增预设时需两边同步修改，容易遗漏。

**建议**：将预设数据抽取为共享的 JSON 配置（如 `app/shared/themePresets.json`），前后端各自 import。或至少抽取一个 shared module 供两端引用。

### 4. ensureAgentSession 存在竞态条件

**文件**：[App.tsx](file:///Users/g-air/projects/workflow-slide/app/src/App.tsx#L671-L697)

**问题**：`ensureAgentSession` 使用 `agentSessionAbortRef` 中断前一次请求，但 `handleOpenAgent` 和 `handleSendAgentMessage` 两处可能同时触发，导致：
- 前一次请求被 abort 但 state 未正确回滚
- 第二次请求可能在 session 创建完成前就发送消息

**建议**：添加一个 `agentSessionPromiseRef` 来跟踪当前正在创建的 session promise，避免重复创建：

```ts
const agentSessionPromiseRef = useRef<Promise<string> | null>(null)

async function ensureAgentSession() {
  if (agentSessionId) return agentSessionId
  if (agentSessionPromiseRef.current) return agentSessionPromiseRef.current

  const promise = (async () => {
    // ... create session logic
  })()

  agentSessionPromiseRef.current = promise
  try {
    return await promise
  } finally {
    agentSessionPromiseRef.current = null
  }
}
```

### 5. WorkflowChatMessageList 硬编码字符串

**文件**：[WorkflowChatMessageList.tsx](file:///Users/g-air/projects/workflow-slide/app/src/components/agent/WorkflowChatMessageList.tsx#L21)

**问题**：

```tsx
<span>{message.role === 'assistant' ? 'AI' : 'You'}</span>
```

"AI" 和 "You" 是硬编码的，未通过 i18n 系统。中文界面下也会显示英文标签。

**建议**：通过 props 传入或使用全局 i18n：

```tsx
type Props = {
  messages: WorkflowAgentMessage[]
  emptyLabel: string
  roleLabels: { user: string; assistant: string }
}
```

---

## 三、中优先级建议

### 6. 服务端路由使用 if/else 链式匹配

**文件**：[index.mjs](file:///Users/g-air/projects/workflow-slide/app/server/index.mjs#L147-L369)

**问题**：当前使用 220+ 行的 if/else 链路匹配路由，每个分支都需要顺序执行直至命中。随着 API 增多，路由解析效率会持续下降。

**建议**：引入路由表模式或轻量路由：

```js
const routes = [
  { method: 'GET', pattern: /^\/api\/health$/, handler: handleHealth },
  { method: 'POST', pattern: /^\/api\/ai\/workflow\/sessions$/, handler: handleCreateSession },
  { method: 'POST', pattern: /^\/api\/ai\/workflow\/sessions\/([0-9a-f-]+)\/messages$/i, handler: handleSendMessage },
  // ...
]

function matchRoute(method, path) {
  return routes.find(r => r.method === method && r.pattern.test(path))
}
```

### 7. workflowJsonSubAgent 中的 prompt injection 魔法字符串

**文件**：[workflowJsonSubAgent.mjs](file:///Users/g-air/projects/workflow-slide/app/server/ai/workflowJsonSubAgent.mjs#L62-L68)

**问题**：强制注入 `role: 'assistant', content: '```json\n'` 来诱导模型直接输出 JSON（prefix generation）。这种技巧依赖模型行为，可能在某些模型/版本下失效。

**建议**：至少将该策略包装成显式选项：

```js
const USE_PREFIX_GENERATION = clientConfig.enablePrefixGeneration ?? false
```

并在 `getAiConfig()` 中显式控制，而非隐式依赖 DeepSeek `/beta` 端点。

### 8. Agent 会话状态管理散落在 App.tsx 中

**问题**：`agentSessionId`, `agentMessages`, `agentState`, `agentProposal`, `agentInput`, `isAgentLoading`, `isAgentExecuting`, `agentError` 等 8 个 state 散落在 App.tsx 中，增加了理解的难度。

**建议**：合并为 `useReducer` 或抽取为自定义 Hook（见第 2 条）。

---

## 四、低优先级 / 代码风格建议

### 9. 缺少 Agent UI 组件的单元测试

新增的 3 个 Agent 组件（Launcher / Window / ChatMessageList）均无测试覆盖。建议至少覆盖：
- ChatMessageList 空状态 / 消息渲染
- Window 的 execute shortcut 逻辑（Ctrl/Command+Enter / Enter）
- Launcher 拖拽 disabled 状态

### 10. editor.css 已有约 400 行 Agent 样式

**文件**：[editor.css](file:///Users/g-air/projects/workflow-slide/app/src/styles/editor.css)

**建议**：将 Agent 相关样式拆分到独立的 `agent.css`，与组件放在同一目录下，便于按需加载和维护。

### 11. App.tsx 中的工具函数可外移

**文件**：[App.tsx](file:///Users/g-air/projects/workflow-slide/app/src/App.tsx#L56-L100)

```ts
function createAgentUiMessage(...) { ... }
function sliceRecentAgentTurns(...) { ... }
function getApiErrorMessage(...) { ... }
function isExecuteShortcut(...) { ... }
```

建议移至 `app/src/utils/agentHelpers.ts`，与其他 utils（如 `exportHtml.ts`, `theme.ts`）风格保持一致。

### 12. server/config.test.mjs 测试环境清理方式不够健壮

**文件**：[config.test.mjs](file:///Users/g-air/projects/workflow-slide/app/server/config.test.mjs#L1-L12)

**问题**：`afterEach` 通过 `delete process.env[key]` 逐个恢复环境变量。如果原先 key 存在但被测试修改为不同值，此逻辑正确。但若引入 `process.env = { ... }` 替换（在某些测试框架中可能出现），此清理可能失效。

**建议**：使用 vitest 的 `vi.stubEnv()` 或包装安全的 env 快照/恢复逻辑。

### 13. contracts.ts 类型定义规范

**文件**：[contracts.ts](file:///Users/g-air/projects/workflow-slide/app/src/api/contracts.ts)

**正面评价**：API 合约定义非常完整且规范。类型导出清晰，错误码枚举明确。建议将此文件作为后续新增 API 的参考模板。

---

## 五、变更总结

| 类别 | 数量 | 评价 |
|------|------|------|
| 新增目录 | 4（server/ai, agent 组件, test 目录, legacy docs） | 结构合理 |
| 新增 TypeScript/TSX 文件 | 3（Agent 组件） | 质量良好，但缺少测试 |
| 新增 .mjs 后端文件 | 12（AI 流水线 + 测试） | 结构清晰，分层合理 |
| 新增测试文件 | 5 | 覆盖了关键逻辑，建议增加组件测试 |
| 大幅修改文件 | 2（App.tsx +1200, index.mjs +477） | 功能完整但需解耦 |
| 中幅修改文件 | 6（contracts, client, i18n, editor.css 等） | 质量良好 |
| 小幅修改文件 | 7（runtime, themePresets, exportHtml 等） | 质量良好 |
| 新增 dev_docs | 2（chat.md, workflow_agent.json 等） | 设计文档已更新 |

## 六、建议的修复优先级

1. **立即修复**：React Hooks 规则违规（lint error）
2. **commit 前**：抽取 App.tsx Agent hook，解决竞态条件
3. **下一迭代**：统一主题预设、i18n 补全、拆分路由匹配
4. **后续优化**：增加组件测试、拆分 CSS、外移工具函数
