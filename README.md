# Workflow Tool

Section 式流程图编辑器，支持本地草稿编辑、SQLite/PostgreSQL 持久化，以及会话式 AI workflow agent 生成。

## 当前能力

- React 19 + TypeScript + Vite 前端编辑器
- Node.js HTTP API，支持 PostgreSQL / SQLite
- 本地自动保存、远端草稿保存、图列表、版本历史、版本恢复
- JSON / HTML 导入导出
- 主题色会同步影响整个系统 UI，HTML 导出中的箭头也会跟随当前主题色
- 内置多套通用颜色主题，默认紫色，并补充橙、石墨、青碧、青绿等扩展色系
- AI workflow agent 创建会话时会携带当前主题快照，生成结果默认贴合当前主题而不是只依赖 preset id
- 可拖拽 AI agent 入口，打开右侧抽屉式侧栏，多轮对话后确认执行生成 workflow
- agent 输入支持 `Ctrl/Command + Enter` 发送；进入可执行状态后可直接按 `Enter` 开始执行
- 优化 agent chat 空状态布局，避免无消息时输入框和操作按钮被异常拉伸
- agent 对话改为由前端随请求发送最近 10 轮 history，后端只使用最近 10 轮作为上下文
- conversation agent 在空响应或非 JSON 响应时输出结构化诊断信息，便于排查 provider 兼容性与上下文问题
- 新增基于 `dev_docs/test_payload.json` 的诊断测试，可复现多轮对话后 provider 返回空正文的错误路径
- AI 生成结果在本地模式直接加载，在远端模式走现有 `importDiagram()` 持久化链路

## 运行方式

所有命令都在 `app/` 目录下执行。

### 1. local-only

只启动前端，不连接数据库。

```bash
cd app
npm run dev
```

### 2. remote

前端连接远端 API 服务。

```bash
# app/.env
# VITE_STORAGE_MODE=remote
# VITE_API_BASE_URL=https://your-server.example/api

cd app
npm run dev:remote
```

### 3. local-db

前端连接本地 SQLite server。

```bash
# app/.env
# STORAGE_DRIVER=sqlite

cd app
npm run db:migrate:sqlite
npm run dev:local-db
```

## AI Agent 配置

AI workflow agent 运行在服务端，需要在 `app/.env` 中配置：

```bash
OPENAI_API_KEY=...
DEFAULT_MODEL_NAME=...
# 可选
OPENAI_API_BASE=https://api.openai.com/v1
ENABLE_THINKING=false
DEFAULT_REASONING_EFFORT=medium
WORKFLOW_JSON_BASE_URL=https://api.openai.com/v1
WORKFLOW_JSON_MODEL_NAME=...
```

说明：

- 主 agent 负责多轮需求理解和执行确认
- sub agent 负责 prefix 续写生成 workflow JSON
- 服务端会对模型结果做提取、归一化、布局和 `Diagram` 校验
- 前端会先请求 `/api/health` 探测 `supportsAi`，只有服务端确认可用时才显示 agent
- 未设置 `WORKFLOW_JSON_BASE_URL` 时，sub agent 默认复用 `OPENAI_API_BASE`
- 如果 `OPENAI_API_BASE=https://api.deepseek.com`，sub agent 会自动切到 `https://api.deepseek.com/beta` 以支持 prefix 续写
- 如果模型供应商返回 `401/403`，前端会直接显示 AI 凭证或 base URL 配置错误

## AI workflow 实现流程

1. 前端启动后会先请求 `/api/health` 探测 `supportsAi`，只有服务端确认 AI 可用时才显示 agent 入口。
2. 用户打开 agent 浮窗后，`App.tsx` 会调用 `POST /api/ai/workflow/sessions` 创建 session，并带上当前画布语言和主题 preset。
3. 如果当前画布已经存在 workflow，前端会把当前 `Diagram` 一起作为 reference diagram 提交给 agent 内部链路，避免后续修改从 0 开始生成。
4. 用户发送需求时，前端把当前输入、最近 10 轮对话 history，以及当前画布 `Diagram` 一起发到 `POST /api/ai/workflow/sessions/:sessionId/messages`。
5. 服务端 `workflowExecutionService` 调用 conversation agent，仅让模型产出结构化 JSON：`reply`、`state`、`canExecute`、`proposal`。当状态切到 `awaiting_execution_confirmation` 时，session store 会保存 proposal 并递增 `proposal.version`；如果有 reference diagram，也会一并作为内部上下文保留。
6. 用户点击执行，或在可执行状态下直接按 `Enter`，前端调用 `POST /api/ai/workflow/sessions/:sessionId/execute`，并提交 `confirmed=true`、当前 `proposalVersion` 和当前画布 `Diagram`，避免旧提案被误执行。
7. 服务端执行阶段会调用 workflow JSON sub-agent，只生成语义化 workflow JSON；如果 reference diagram 存在，sub-agent 会把它当作“当前 workflow 基线”进行微调，而不是完全从零开始。随后 normalizer 会补齐默认值、清洗非法 lane/node/edge、套用主题 preset，并通过 deterministic layout 计算节点坐标，最终产出合法 `Diagram`。
8. 前端拿到生成结果后，本地模式直接替换当前画布；远端模式复用 `persistenceService.importDiagram()` 写回当前文档，再统一 `replace-diagram` 更新编辑器状态。

补充：

- conversation agent 每次调用前都会显式注入当前 session state、当前 proposal 和 proposal version，不再只依赖 history 自行恢复上下文。
- conversation agent 每次调用前还会显式注入当前 reference diagram，上下文里会说明“这是当前画布 workflow”，便于把“优化一下/加一个分支”解释为对现图的微调。
- 当 session 已进入 `awaiting_execution_confirmation` 时，如果用户继续发送“优化一下/修改需求”这类非执行消息，系统会把它当作提案更新请求，而不是误判为执行命令。
- conversation agent 不再强依赖 `response_format={ type: 'json_object' }`；当前通过 prompt 要求模型返回单个 ```json fenced block，再由服务端从正文中抽取 JSON，以兼容更多模型服务。
- fenced JSON 解析支持 block 前后附带额外说明文字；只要正文中存在可识别的 ```json block，服务端会优先从中抽取 JSON，不受外围文本影响。
- conversation agent 的 system prompt 现在会显式说明 `reply`、`state`、`canExecute`、`proposal.title`、`proposal.summary` 的含义和返回条件，减少模型对字段语义的误判。
- conversation agent 现在还必须返回 `proposal.themePresetId`，并且该值必须来自项目内置 theme preset 列表；execution 会使用这个会话内更新后的目标主题，而不是继续沿用创建 session 时的旧主题。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动前端，`local-only` |
| `npm run dev:local-only` | 启动前端，`local-only` |
| `npm run dev:remote` | 启动前端，连接远端 API |
| `npm run dev:local-db` | 启动前端和本地 SQLite server |
| `npm run server` | 启动后端 |
| `npm run server:dev` | 启动后端 watch 模式 |
| `npm run db:migrate` | PostgreSQL 迁移 |
| `npm run db:migrate:sqlite` | SQLite 迁移 |
| `npm run test` | 运行测试 |
| `npm run lint` | 运行 ESLint |
| `npm run build` | 类型检查并构建 |

## 主要目录

- `app/src/`：前端应用
- `app/src/components/`：编辑器 UI 与 AI agent 浮窗
- `app/src/editor/`：编辑器 reducer 和测试
- `app/src/storage/`：本地缓存、自动保存、远端同步
- `app/src/api/`：前端 API client 与 contract
- `app/server/`：Node HTTP API
- `app/server/ai/`：workflow agent、JSON 生成、normalizer、layout、执行服务
- `dev_docs/`：开发计划、设计说明、开发日志

## 验证

当前建议的最小验证集：

```bash
cd app
npm run test
npm run lint
npm run build
```
