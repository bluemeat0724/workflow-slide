# Workflow Tool 启动模式改造开发计划

## 1. 背景

当前项目已经具备以下能力：

- 前端编辑器可独立运行
- 后端 server 提供基于 PostgreSQL 的图存储、图列表、版本历史、恢复版本
- 前端 `PersistenceService` 已支持“有 API 时走数据库、无 API 时走本地缓存”的基础分支

但当前启动体验仍然偏“单一路径”：

- 前端默认假设本地 `/api` 可用
- Vite 代理固定转发到本地 `3103`
- server 仅支持 PostgreSQL
- UI 对“数据库能力是否可用”缺少显式模式抽象

本次改造目标是把项目整理为三种明确的启动方式，并让用户在不同启动方式下获得一致、可预期的体验。

## 2. 目标

支持三种启动模式：

### 2.1 `local-db`

- 启动前端
- 同时启动本地 server
- server 使用本地 SQLite 存储
- 用户可创建图、查看图列表、查看版本历史、保存版本、恢复版本

### 2.2 `remote`

- 仅启动前端
- 前端通过配置的远端 server URL 访问 API
- 用户可创建图、查看图列表、查看版本历史、保存版本、恢复版本

### 2.3 `local-only`

- 仅启动前端
- 不初始化数据库 API
- 用户可创建和编辑流程图
- 支持浏览器本地草稿恢复
- 不支持保存到数据库
- 图列表、版本历史、删除数据库图等相关操作不可见

## 3. 非目标

本次改造不包括：

- 多人协作
- 实时同步
- 账号体系重构
- PostgreSQL 与 SQLite 之间的数据迁移工具
- 运行中动态切换模式

## 4. 当前实现观察

当前代码中已有一些可以直接复用的基础：

- `app/src/App.tsx`
  - 已通过 `createPersistenceService({ api: ... })` 在有无 API 间切换
  - 但模式判断仍然主要依赖 `diagramId` 查询参数和本地固定 `/api`
- `app/src/storage/persistenceService.ts`
  - `api === null` 时已支持仅写本地缓存
  - 适合作为 `local-only` 的持久化基础
- `app/src/api/client.ts`
  - 已支持 `baseUrl` 参数
  - 但当前 `App.tsx` 初始化仍是固定逻辑
- `app/vite.config.ts`
  - 当前 `/api` 代理固定指向 `http://127.0.0.1:3103`
- `app/server/config.mjs` 和 `app/server/db.mjs`
  - 当前仅支持 PostgreSQL
- `app/server/index.mjs`
  - HTTP 路由与 PostgreSQL SQL 紧耦合
  - SQLite 接入前必须先做 repository 抽象

## 5. 设计原则

### 5.1 显式模式优先

不要再让“是否有 `diagramId`”承担运行模式判断职责。启动模式必须由 env 或启动脚本显式确定。

### 5.2 UI 能力由 capability 驱动

按钮是否显示、图列表是否可用、版本历史是否可用，不应由零散布尔值拼接，而应由统一 capability 配置决定。

### 5.3 先抽象后接入 SQLite

不要在现有 `server/index.mjs` 中混写 PostgreSQL / SQLite 分支。先抽出 repository 接口，再实现两套存储。

### 5.4 优先交付低风险收益

先完成 `remote` 和 `local-only`，尽快把启动体验收口；再做成本最高的 `local-db`。

## 6. 总体方案

### 6.1 前端运行时配置

新增统一运行时配置模块，例如：

- `app/src/config/runtime.ts`

建议提供：

```ts
export type StorageMode = 'local-db' | 'remote' | 'local-only'

export type RuntimeCapabilities = {
  supportsDatabase: boolean
  supportsDiagramLibrary: boolean
  supportsRevisionHistory: boolean
  supportsCreateRemoteDocument: boolean
}

export type RuntimeConfig = {
  storageMode: StorageMode
  apiBaseUrl: string | null
  capabilities: RuntimeCapabilities
}
```

### 6.2 前端模式行为

| 模式 | API Client | 图列表 | 版本历史 | 保存版本 | 本地草稿缓存 |
| --- | --- | --- | --- | --- | --- |
| `local-db` | 启用 | 显示 | 显示 | 可用 | 保留 |
| `remote` | 启用 | 显示 | 显示 | 可用 | 保留 |
| `local-only` | 禁用 | 隐藏 | 隐藏 | 不可用 | 启用 |

### 6.3 后端存储抽象

建议新增 repository 层，例如：

- `app/server/repository/diagramRepository.mjs`
- `app/server/repository/postgresDiagramRepository.mjs`
- `app/server/repository/sqliteDiagramRepository.mjs`

由 HTTP 层依赖 repository，而不是直接依赖 `pg`。

## 7. 分阶段实施计划

## Phase 1: 前端模式抽象

### 目标

把运行模式从隐式判断改为显式配置。

### 任务

1. 新增 `app/src/config/runtime.ts`
2. 定义 `VITE_STORAGE_MODE`
3. 定义 `VITE_API_BASE_URL`
4. 在 `App.tsx` 中基于 runtime config 初始化 API client
5. 保留 `diagramId` 查询参数，但仅在 `supportsDatabase === true` 时生效

### 涉及文件

- `app/src/App.tsx`
- `app/src/api/client.ts`
- `app/src/config/runtime.ts`
- `app/vite.config.ts`

### 产出

- `remote` 和 `local-only` 有清晰的前端模式分支

## Phase 2: 前端 UI 与交互收口

### 目标

让三种模式在界面上表达明确，不留下误导入口。

### 任务

1. 将 `Toolbar` 的零散布尔控制改为 capability 驱动
2. `local-only` 模式隐藏：
   - 图列表
   - 版本历史
   - 保存版本
   - 删除数据库图
   - 保存到数据库
3. `local-db` 和 `remote` 共用数据库相关操作 UI
4. 统一状态文案，弱化“remote”措辞，改成更中性的“数据库保存 / 数据库加载”
5. 视情况将 `RemoteLibrary` 重命名为 `DiagramLibrary`

### 涉及文件

- `app/src/App.tsx`
- `app/src/components/toolbar/Toolbar.tsx`
- `app/src/components/library/RemoteLibrary.tsx`
- `app/src/i18n/zh-CN.ts`
- `app/src/i18n/en-US.ts`
- `app/src/i18n/index.ts`

### 产出

- `local-only` 模式不再暴露任何数据库能力入口

## Phase 3: 启动脚本与开发配置

### 目标

让三种模式都能被一条命令明确启动。

### 建议脚本

```json
{
  "scripts": {
    "dev:local-only": "vite",
    "dev:remote": "vite",
    "dev:local-db": "node scripts/dev-local-db.mjs"
  }
}
```

### 说明

- `dev:local-only`
  - 注入 `VITE_STORAGE_MODE=local-only`
- `dev:remote`
  - 注入 `VITE_STORAGE_MODE=remote`
  - 注入 `VITE_API_BASE_URL=<remote-server-url>`
- `dev:local-db`
  - 启动 Vite
  - 启动本地 SQLite server

### 实施建议

有两种可选方案：

1. 新增一个轻量 `scripts/dev-local-db.mjs`
   - 负责并行拉起前端和本地 server
   - 优点是无需新增依赖
2. 引入 `concurrently`
   - 简化脚本编排
   - 但会新增一个开发依赖

建议优先采用方案 1，减少依赖面。

### 涉及文件

- `app/package.json`
- `app/vite.config.ts`
- 可选新增 `app/scripts/dev-local-db.mjs`

## Phase 4: server 存储层解耦

### 目标

把当前 `index.mjs` 中的 PostgreSQL SQL 抽离为可替换存储实现。

### 任务

1. 为以下操作定义统一接口：
   - `getDiagramById`
   - `listDiagrams`
   - `createDiagram`
   - `updateDraft`
   - `listRevisions`
   - `getRevision`
   - `createRevision`
   - `restoreRevision`
   - `importDiagram`
   - `softDeleteDiagram`
2. `index.mjs` 只保留：
   - 路由解析
   - 请求体解析
   - 参数校验
   - 错误映射
   - repository 调用
3. 将 PostgreSQL 现有逻辑迁移到 `postgresDiagramRepository`

### 涉及文件

- `app/server/index.mjs`
- `app/server/db.mjs`
- `app/server/config.mjs`
- 新增 `app/server/repository/*`

### 产出

- PostgreSQL 逻辑可继续工作
- SQLite 接入点明确

## Phase 5: SQLite 支持

### 目标

为 `local-db` 提供本地数据库能力。

### 配置建议

新增 server env：

```env
STORAGE_DRIVER=sqlite
SQLITE_FILE=./data/workflow-tool.sqlite
```

并保留：

```env
STORAGE_DRIVER=postgres
DATABASE_URL=postgresql://...
```

### SQLite schema 设计建议

- `latest_draft_json` 使用 `TEXT`
- `content_json` 使用 `TEXT`
- 时间字段统一存 ISO 8601 字符串
- 版本号继续使用整数

### 需要适配的 SQL 差异

- PostgreSQL `jsonb` -> SQLite `text`
- PostgreSQL `ilike` -> SQLite `lower(title) like lower(?)`
- PostgreSQL `count(*)::int` -> SQLite `count(*)`
- PostgreSQL `for update` -> SQLite 事务串行更新语义

### 任务

1. 选择 SQLite 驱动
2. 实现 `sqliteDiagramRepository`
3. 新增 SQLite migration 入口
4. 确认本地 server 首次启动时的 schema 初始化策略

### 涉及文件

- `app/server/config.mjs`
- `app/server/db.mjs`
- `app/server/migrate.mjs`
- 新增 `app/server/migrate-sqlite.mjs`
- 新增 `app/server/repository/sqliteDiagramRepository.mjs`

### 产出

- 本地 SQLite 可完整支持图保存、图列表、版本历史、恢复版本

## Phase 6: 文档与示例配置

### 目标

让新开发者无需阅读源码即可启动三种模式。

### 任务

1. 更新 `app/.env.example`
2. 更新 `README.md`
3. 记录三种模式的启动命令、env 示例、能力差异
4. 说明 `local-only` 只支持浏览器本地草稿恢复

### 产出

- 一份面向开发者的最小启动指南

## Phase 7: 测试与验收

### 前端测试

1. runtime config 解析测试
2. `Toolbar` 模式可见性测试
3. `local-only` 不显示图列表测试
4. `local-only` 不初始化 API client 测试

### 持久化测试

1. `api === null` 时只写本地缓存
2. `api !== null` 时走数据库保存
3. 模式切换后不触发错误请求

### 后端测试

1. PostgreSQL repository 契约测试
2. SQLite repository 契约测试
3. 版本冲突测试
4. 删除图测试
5. 恢复版本测试

### 建议验证命令

- `npm run test`
- `npm run lint`
- `npm run build`

## 8. 推荐里程碑

### M1

- 完成 `remote`
- 完成 `local-only`
- UI 与状态文案收口

### M2

- repository 抽象完成
- PostgreSQL 行为不回归

### M3

- SQLite 接入完成
- `local-db` 跑通

### M4

- 文档、测试、脚本完善

## 9. 风险与待确认项

### 9.1 高风险项

1. `app/server/index.mjs` 当前同时承担路由层和数据访问层职责，若不先解耦，SQLite 改造成本会快速放大。
2. 当前前端文案大量使用“远端”语义，接入 `local-db` 后会出现术语不准确的问题。
3. `diagramId` 与当前持久化行为耦合较深，若不拆开，`local-only` 下容易残留边缘请求。
4. SQLite 与 PostgreSQL 的事务语义不同，版本冲突相关逻辑必须单独验证。

### 9.2 待确认项（已确认）

1. `local-db` 模式下 SQLite 文件默认存放位置是否固定为仓库内 `app/data/`  同意
2. 是否允许为开发脚本新增 `concurrently` 之类的依赖  允许
3. 是否需要在 UI 上显式显示当前模式，例如“本地数据库模式 / 远端服务模式 / 本地草稿模式”  同意 使用合适图标表示
4. 是否需要给 `remote` 模式增加“服务地址错误”的更明确引导文案  同意 提示用户检查配置文件

## 10. 建议的环境变量草案

### 前端

```env
VITE_STORAGE_MODE=local-only
VITE_API_BASE_URL=
```

### 远端模式

```env
VITE_STORAGE_MODE=remote
VITE_API_BASE_URL=https://example.com/api
```

### 本地数据库模式

```env
VITE_STORAGE_MODE=local-db
VITE_API_BASE_URL=/api
```

### server PostgreSQL

```env
STORAGE_DRIVER=postgres
DATABASE_URL=postgresql://workflow:change-me@localhost:5432/workflow_slide
```

### server SQLite

```env
STORAGE_DRIVER=sqlite
SQLITE_FILE=./data/workflow-tool.sqlite
```

## 11. 验收口径

### `dev:local-only`

- 启动后页面可正常编辑流程图
- 页面不发任何图列表、版本历史、创建数据库文档相关请求
- 刷新后仍能恢复本地草稿

### `dev:remote`

- 启动后只运行前端
- 所有 API 请求都发往配置的远端 URL
- 图列表、版本历史、保存版本功能正常

### `dev:local-db`

- 启动后自动拉起前端和本地 SQLite server
- 用户可创建图、查看图列表、查看版本历史、保存版本、恢复版本
- 重启后 SQLite 中的数据仍存在

## 12. 推荐实施顺序

1. 先做 Phase 1-3，交付 `remote` 与 `local-only`
2. 再做 Phase 4-5，交付 `local-db`
3. 最后做 Phase 6-7，完善文档、测试和验收

这样可以先用较低风险完成用户最直接能感知的启动体验优化，再处理 server 存储层重构这部分高成本工作。
