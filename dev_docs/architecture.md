# 技术架构

## 主要目录

- `app/src/`：前端应用
- `app/src/components/`：编辑器 UI 与 AI agent 浮窗
- `app/src/editor/`：编辑器 reducer 和测试
- `app/src/hooks/`：React hooks（workflow agent、canvas interaction、diagram library）
- `app/src/storage/`：本地缓存、自动保存、远端同步
- `app/src/utils/`：几何计算、主题构建、边动画引擎、agent UI 辅助、导入导出
- `app/src/api/`：前端 API client 与 contract
- `app/shared/`：前后端共享数据定义（主题预设）
- `app/server/`：Node HTTP API
- `app/server/ai/`：workflow agent、JSON 生成、normalizer、layout、执行服务、prompt 模板、错误分类、JSON 解析
- `app/server/render/`：GIF 导出渲染链路（导出模板、浏览器采帧、GIF 编码、演示态参数、边动画规划、legacy canvas 渲染）
- `dev_docs/`：开发计划、设计说明、代码优化计划、开发日志

## AI Agent 配置

### 概览

项目代码使用 **OpenAI SDK**（`openai` npm 包），但默认指向 **DeepSeek API**。DeepSeek 提供 OpenAI 兼容的接口，只需修改 `baseURL` 即可切换。如果使用 OpenAI 原版或其他兼容服务，只需修改 `OPENAI_API_BASE`。

AI workflow agent 运行在服务端，包含两个阶段，使用**两个独立的 OpenAI client**：

| 阶段 | Client | 用途 | API 端点 |
|---|---|---|---|
| Conversation（对话） | `createConversationClient()` | 多轮需求理解、方案确认 | 主 API（`OPENAI_API_BASE`） |
| Execution（执行） | `createWorkflowJsonClient()` | 生成 workflow JSON | 独立端点（`WORKFLOW_JSON_BASE_URL`），DeepSeek 自动切 `/beta` |

### 环境变量

```bash
# 必填
OPENAI_API_KEY=sk-xxx
DEFAULT_MODEL_NAME=deepseek-chat

# 可选 — 对话 agent
OPENAI_API_BASE=https://api.deepseek.com
ENABLE_THINKING=false
DEFAULT_REASONING_EFFORT=medium

# 可选 — Execution 阶段独立端点/模型
WORKFLOW_JSON_BASE_URL=
WORKFLOW_JSON_MODEL_NAME=
```

### DeepSeek FIM (Fill-in-the-Middle) Completion

Execution 阶段（JSON 生成）使用了 DeepSeek 的 **FIM Completion** 能力。这是一种特殊的补全形式：给定前缀（prefix）和后缀（suffix），模型填充中间部分。

具体实现方式（见 [workflowJsonSubAgent.mjs](file:///Users/g-air/projects/workflow-slide/app/server/ai/workflowJsonSubAgent.mjs)）：

1. 构造一个 `role: 'assistant'` 的消息，内容为 ````json\n`，并设置 `prefix: true`
2. 设置 `stop: ['```']` 作为后缀（后缀通过 stop token 隐式指定）
3. 模型在此前缀之后续写完整 JSON，遇到 ````` 停止
4. 服务端将续写内容拼接为 ```` ```json\n{续写内容}``` ```` 后解析

```
[System Prompt] → [User Prompt(proposal + reference)] → [```json\n ← prefix, 模型续写] → [``` ← stop]
```

这种方式的优势：模型不需要理解"输出 JSON"的指令，而是直接在代码上下文中续写，大幅提高了 JSON 格式的准确性和结构一致性。

### DeepSeek `/beta` 端点自动切换

FIM Completion 需要 DeepSeek 的 `/beta` 端点。代码在 [config.mjs](file:///Users/g-air/projects/workflow-slide/app/server/config.mjs) 中自动处理：

- 当 `OPENAI_API_BASE=https://api.deepseek.com` 且未显式设置 `WORKFLOW_JSON_BASE_URL` 时
- `resolveWorkflowJsonBaseUrl()` 自动将 execution client 的 baseURL 切换为 `https://api.deepseek.com/beta`
- 如果设置了其他 provider（如 OpenAI），则直接使用原地址（不使用 prefix 模式也能正常工作）

### 服务端校验与能力探测

- 服务端会对模型结果做 JSON 解析、归一化、布局计算和 `Diagram` 结构校验
- 前端先请求 `GET /api/health` 探测 `supportsAi`，只有服务端确认 AI 配置可用时才显示 agent 入口
- 如果模型供应商返回 `401/403`，服务端归一化为 `AI_CONFIGURATION_ERROR`，前端直接展示配置错误提示

### 链路架构

```
用户在对话框中输入需求
  → Conversation Agent（主 API）多轮对话理解 → proposal
  → 用户确认执行
  → Workflow JSON Sub-Agent（/beta FIM）生成 JSON
  → Normalizer 归一化 + Layout 计算
  → Diagram 校验
  → 返回前端画布
```

## GIF 导出说明

- 新版 GIF 导出链路依赖服务端 `playwright` headless Chromium 运行时。
- 提供的 API 镜像已内置 Playwright 运行时，并通过 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 复用镜像里的 Chromium，避免构建时重复下载。
- 如果你不使用仓库提供的 API 镜像，部署环境至少要满足：
  - 可启动的 Chromium
  - Playwright 所需系统库
  - 与 `better-sqlite3`、`@napi-rs/canvas` 兼容的 glibc Linux 运行时
- 如果本机或部署环境无法启动 Chromium，`POST /api/gif` 会失败，并返回明确错误信息。
- 服务端现在支持通过环境变量覆盖 GIF 浏览器启动参数：
  - `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
  - `GIF_EXPORT_BROWSER_LAUNCH_TIMEOUT_MS`
  - `GIF_EXPORT_USE_SANDBOX`
- 当前环境类问题不能通过前端配置绕开，需要确认 Playwright/Chromium 在目标机器上具备可启动权限。

## 导出文档

- `dev_docs/gif_export_ppt_optimization_plan.md`：Workflow GIF 导出重构方案，目标是让导出的动图更适合嵌入 PowerPoint 展示。
