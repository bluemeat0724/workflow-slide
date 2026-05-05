# 代码优化计划

## 目标

这份计划面向当前 workflow editor 代码库，目标不是重写，而是在保持现有功能可用的前提下，降低核心入口复杂度、减少重复实现、补齐关键测试断层，并让后续功能迭代成本可预测。

预期收益：

- 降低单文件和单模块的认知负担
- 减少前后端跨层耦合和重复逻辑
- 提高 AI、持久化、导出链路的回归可控性
- 为后续多人协作和功能扩展建立更稳定的边界

## 当前代码现状

基于 2026-05-06 仓库代码扫描，当前主要热点如下：

| 模块 | 规模 | 现状判断 |
|---|---:|---|
| `app/src/App.tsx` | 782 行 | 同时承担初始化、URL 状态、编辑器命令、持久化、导入导出、图库、AI agent、键盘事件 |
| `app/src/storage/persistenceService.ts` | 499 行 | 同时承担本地缓存、远端同步、自动保存、冲突处理、离线回退 |
| `app/src/hooks/useWorkflowAgent.ts` | 376 行 | UI 状态机、会话初始化、消息发送、执行确认、拖拽入口位置都放在一个 hook 内 |
| `app/src/hooks/useCanvasInteraction.ts` | 345 行 | 画布拖拽、缩放、连线、框选等多种 pointer 交互共享一套状态 |
| `app/server/index.mjs` | 442 行 | HTTP server、CORS、JSON 解析、静态文件托管、路由绑定、业务处理混在一起 |
| `app/server/repository/postgresDiagramRepository.mjs` | 537 行 | 业务流程和 SQL 强耦合 |
| `app/server/repository/sqliteDiagramRepository.mjs` | 390 行 | 与 PostgreSQL 仓储存在大段重复流程 |

测试分布也比较明显：

- 已有测试集中在 reducer、工具函数、AI 服务端模块、持久化服务
- `app/src/components/` 下没有组件测试
- `app/src/hooks/` 下没有 hook 测试
- 前后端之间缺少 API contract 级别的集成验证

这说明项目已经有不错的逻辑测试意识，但复杂的交互入口和跨层协作仍然主要依赖人工回归。

## 主要问题

### 1. 前端入口聚合过多职责

`App.tsx` 已经成为事实上的应用编排层和业务控制器。它既管理 reducer，又直接处理：

- URL 查询参数和新建图逻辑
- 状态栏文案映射
- 本地/远端持久化
- JSON/HTML/GIF 导入导出
- 图库和版本历史联动
- AI agent 结果应用
- 全局键盘删除行为

问题不在于“代码能不能工作”，而在于任何一个功能改动都容易回到这个入口叠加条件分支，后续维护成本会持续上升。

### 2. 编辑器规则分散在 reducer、组件入口和交互 hook 中

例如边连线校验、删除规则、多选行为、节点位置约束分别出现在：

- `app/src/App.tsx`
- `app/src/editor/editorState.ts`
- `app/src/hooks/useCanvasInteraction.ts`
- `app/src/utils/geometry.ts`

这会导致业务规则难以复用，也难以确认“哪个层才是最终真相”。

### 3. 持久化与 AI 流程都缺少更清晰的流程边界

`persistenceService.ts` 和 `useWorkflowAgent.ts` 都是“功能完整但职责偏宽”的模块：

- 持久化服务同时处理缓存、定时器、API、冲突、离线草稿
- agent hook 同时处理网络调用、状态机、UI message 拼装、拖拽持久化

这类模块短期开发效率高，但长期会让测试粒度越来越粗，排障越来越依赖人工读流程。

### 4. 后端 HTTP 层和业务层边界偏弱

`app/server/index.mjs` 目前是单入口组装，已经包含：

- HTTP request/response 细节
- JSON body 解析
- 错误映射
- 静态资源托管
- route 到 handler 的绑定
- diagram/AI/GIF 的业务调用

当前体量还能工作，但继续叠加功能时会开始影响可测试性和可替换性。

### 5. SQLite / PostgreSQL 仓储重复实现过多

两个仓储共享几乎相同的用例流程：

- 创建 diagram
- 更新 draft
- 保存 revision
- restore revision
- import diagram
- list diagrams / revisions

差异主要在 SQL 方言和事务 API，但现在业务流程也重复了一遍。这意味着每次业务规则升级都要双端同步修改，回归面被动扩大。

### 6. 缺少 UI 与契约层回归保护

当前测试对纯函数和服务模块覆盖不错，但以下风险点缺少自动化保护：

- `App.tsx` 的跨模块协同
- `useWorkflowAgent.ts` 的状态迁移
- `useCanvasInteraction.ts` 的 pointer 行为
- 前端 `contracts.ts` 与后端运行时 schema 的一致性

## 优化原则

1. 不做大重写，按功能批次拆分。
2. 先拆边界，再谈抽象，避免提前设计。
3. 先解决高耦合入口，再处理局部重复。
4. 新抽出的模块必须带测试或可验证边界。
5. 保留现有技术栈：React reducer 架构、Node HTTP、ESM，不为了“现代化”引入无必要的大框架替换。

## 分阶段执行计划

### Phase 1: 收缩前端入口层

优先级：P0

目标：把 `App.tsx` 从“全能控制器”收缩为编排器。

建议拆分：

- `useAppBootstrap`
  - 负责 URL 参数、初始 diagram、health probe、capabilities 初始化
- `usePersistenceController`
  - 负责 `PersistenceService` 生命周期、载入、autosave、状态映射
- `useDiagramCommands`
  - 负责 lane/node/edge/theme 的命令式操作和校验
- `useImportExport`
  - 负责 JSON/HTML/GIF 导入导出
- `useGlobalEditorShortcuts`
  - 负责 Delete/Backspace 等全局编辑快捷键

验收标准：

- `App.tsx` 控制在 300 至 350 行以内
- `App.tsx` 中不再直接包含复杂边校验和远端保存流程
- 新拆分的 hook 至少覆盖关键 happy path 和 error path

### Phase 2: 统一编辑器领域规则

优先级：P0

目标：把“节点、边、选择、多选、约束”这些领域规则从 UI 层抽离到可复用模块。

建议动作：

- 新建 `app/src/editor/commands/` 或 `app/src/editor/domain/`
- 抽出以下纯函数：
  - `validateEdgeMutation`
  - `buildEdgeCreationResult`
  - `deleteNodesAndEdges`
  - `resolveSelectionAfterMutation`
  - `createDefaultNode`
- 将 `App.tsx` 中的 edge 校验迁移到命令层
- 将 `editorState.ts` 中与 UI 文案无关的规则继续纯函数化

验收标准：

- reducer 专注状态变换，不再承担过多派生业务决策
- edge/node 规则可在不挂载 React 的情况下测试
- 多处重复的 diagram 变换逻辑归并为单一实现

### Phase 3: 拆清持久化与 AI 流程

优先级：P1

目标：把两个高风险流程拆成“流程状态 + IO 适配”两层。

### 3.1 Persistence

建议动作：

- 将 `PersistenceService` 拆成：
  - `diagramCacheStore`
  - `diagramRemoteSync`
  - `autosaveScheduler`
  - `persistenceStateMapper`
- 统一 `load/save/import/restore/clearDraft` 的结果类型
- 明确“远端失败但本地可恢复”与“纯本地模式”的分支边界

### 3.2 Workflow Agent

建议动作：

- 将 `useWorkflowAgent.ts` 拆成：
  - `agentStateReducer`
  - `agentSessionClient`
  - `useAgentLauncherPosition`
  - `useWorkflowAgentController`
- 将 reply/proposal/error message 拼装逻辑从 hook 主体里移出
- 为状态迁移建立明确测试矩阵

验收标准：

- `persistenceService.ts` 和 `useWorkflowAgent.ts` 都下降到 250 行左右级别
- 状态迁移可单测，不依赖真实 DOM 事件
- 冲突、超时、abort、离线回退路径有显式测试

### Phase 4: 收敛画布交互复杂度

优先级：P1

目标：降低 pointer 交互逻辑在单个 hook 中的堆叠。

建议动作：

- 将 `useCanvasInteraction.ts` 按模式拆成：
  - `dragInteraction`
  - `resizeInteraction`
  - `connectInteraction`
  - `marqueeInteraction`
- 把命中检测和几何计算继续下沉到 `utils/geometry.ts` 或独立 selector 模块
- 明确 pointer move/up 的事件注册与销毁策略，减少闭包状态耦合

验收标准：

- 交互模式之间的状态字段不再共享一个超宽 union
- 关键画布交互具备 hook 级测试或最小集成测试
- 拖拽、缩放、连线、框选回归不再依赖纯手测

### Phase 5: 后端分层与仓储去重

优先级：P0

目标：把后端从“单文件入口 + 双仓储重复流程”演进为稳定的 transport/service/repository 结构。

建议动作：

- 从 `app/server/index.mjs` 提取：
  - `http/jsonResponse.mjs`
  - `http/readJsonBody.mjs`
  - `http/errorHandler.mjs`
  - `http/staticAssetHandler.mjs`
  - `http/appRoutes.mjs`
- 为 diagram 用例增加 service 层：
  - `diagramService.createDiagram`
  - `diagramService.updateDraft`
  - `diagramService.createRevision`
  - `diagramService.restoreRevision`
  - `diagramService.importDiagram`
- 仓储层只保留：
  - SQL
  - 事务边界
  - 行数据映射

对 PostgreSQL / SQLite 的去重建议：

- 保留各自的 SQL 文件或 statement builder
- 把通用业务流程抽成共享 helper
- 用仓储接口屏蔽事务调用差异，而不是复制整段业务逻辑

验收标准：

- `app/server/index.mjs` 控制在 200 行以内
- SQLite / PostgreSQL 的通用业务流程不再复制两遍
- `index.test.mjs` 可转为更聚焦的 route/service 测试

### Phase 6: 契约与测试补强

优先级：P0

目标：让重构后的边界具备持续保护。

建议动作：

- 增加 `App` 级最小集成测试，覆盖：
  - 加载 diagram
  - 删除节点/边
  - 本地导入 JSON
  - agent 应用结果后的状态切换
- 增加 hook 测试：
  - `useWorkflowAgent`
  - `useCanvasInteraction`
  - `useDiagramLibrary`
- 增加前后端 contract 对齐测试：
  - health payload
  - diagram document
  - revision payload
  - AI session payload
- 为 SQLite / PostgreSQL 建立仓储行为一致性测试集

验收标准：

- 组件/hook 不再是测试空白区
- 至少一组 contract 测试同时约束 client 和 server
- 新增功能优先在拆出的边界层写测试，而不是继续把逻辑堆回入口

## 建议执行顺序

建议按下面顺序推进，而不是并行大改：

1. Phase 1: 收缩 `App.tsx`
2. Phase 2: 统一编辑器规则
3. Phase 5: 后端分层与仓储去重
4. Phase 3: 拆清持久化与 AI 流程
5. Phase 4: 收敛画布交互复杂度
6. Phase 6: 契约与测试补强

原因：

- 前端入口和后端入口是当前最明显的复杂度瓶颈
- 领域规则先归拢，后续拆 hook 和 service 才不会反复移动同一段逻辑
- 持久化、AI、画布交互都依赖更清晰的领域边界，放在第二轮更稳

## 不建议现在做的事情

- 不建议直接改成 Zustand、XState、Express、NestJS 等大框架迁移
- 不建议为了“统一”把前后端全部改成同一语言运行时抽象层
- 不建议先做 UI 视觉重构；当前更急的是结构和回归能力
- 不建议一次性重写仓储；应先抽共享流程，再逐步消除重复

## 里程碑衡量指标

完成一轮优化后，建议至少达到以下指标：

| 指标 | 目标 |
|---|---|
| `app/src/App.tsx` | 小于 350 行 |
| `app/server/index.mjs` | 小于 200 行 |
| `persistenceService.ts` / `useWorkflowAgent.ts` | 单文件控制在 250 行左右 |
| 仓储重复流程 | 仅保留 SQL 与事务差异，业务流程共享 |
| 测试覆盖面 | 新增组件、hook、contract、仓储一致性测试 |

## 结论

这个项目的核心能力已经成形，当前更需要的是“收边界”而不是“加抽象”。最值得优先投入的是两个入口文件、两条高风险流程，以及双仓储重复实现。只要按批次推进，不做大爆炸式重写，这套代码库可以在不打断现有功能交付的情况下明显改善可维护性。
