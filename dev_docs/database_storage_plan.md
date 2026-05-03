# Workflow Tool 数据库存储优化方案

## 1. 目标

当前项目的数据持久化依赖浏览器 `localStorage`，适合单用户、单浏览器、单草稿场景，但无法支撑以下能力：

- 多文档管理
- 跨设备访问
- 版本历史与回滚
- 用户权限与共享
- 后续多人协作

本方案目标是在尽量少改前端编辑器核心逻辑的前提下，将存储升级为：

- 数据库主存
- 本地缓存兜底
- 支持版本历史
- 支持乐观锁并发控制
- 保留当前 JSON 导入导出能力

## 2. 当前实现概况

现有实现位于：

- `app/src/App.tsx`
- `app/src/utils/json.ts`

当前机制如下：

1. 启动时从 `localStorage["workflow-tool-draft"]` 读取草稿
2. 解析成功则恢复，否则清除并回退默认图
3. `diagram` 每次变化时，整包序列化写回 `localStorage`
4. 用户可手动导出 JSON / HTML
5. 用户可手动导入 JSON 覆盖当前状态

这意味着当前存储模型是：

- 单文档
- 单版本
- 单端本地
- 全量覆盖写

## 3. 总体设计

推荐采用：

- 数据库：`PostgreSQL`
- 主存格式：`JSONB`
- 访问方式：后端 REST API
- 前端策略：自动保存到服务端，同时保留本地缓存作为故障兜底

### 3.1 为什么选择 PostgreSQL + JSONB

原因：

- 当前前端核心数据结构天然是完整 `Diagram` JSON
- 现有 JSON 导入导出逻辑可以直接复用
- 画布编辑是高频全图变更，不适合先拆成细颗粒多表写入
- `JSONB` 兼顾灵活性与后续可索引能力

### 3.2 推荐存储分层

推荐分两层存储：

- 当前草稿层：保存“这张图当前最新可编辑状态”
- 历史版本层：保存“某次已确认保存或关键节点快照”

对应数据库表为：

- `diagrams`
- `diagram_snapshots`
- `diagram_revisions`

## 4. 数据库表设计

### 4.1 users

适用于后续接入账号体系。

```sql
create table users (
  id uuid primary key,
  email text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);
```

### 4.2 diagrams

保存图的元信息，不直接存完整内容。

```sql
create table diagrams (
  id uuid primary key,
  owner_user_id uuid not null references users(id),
  title text not null,
  status text not null default 'draft',
  current_revision_id uuid null,
  latest_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint diagrams_status_check
    check (status in ('draft', 'published', 'archived'))
);

create index idx_diagrams_owner_updated
  on diagrams(owner_user_id, updated_at desc)
  where deleted_at is null;
```

字段说明：

- `latest_version`：当前草稿版本号，用于乐观锁
- `current_revision_id`：当前发布或人工保存的稳定版本
- `status`：文档状态

### 4.3 diagram_snapshots

保存当前最新草稿内容。

```sql
create table diagram_snapshots (
  diagram_id uuid primary key references diagrams(id) on delete cascade,
  latest_draft_jsonb jsonb not null,
  schema_version text not null,
  updated_by uuid not null references users(id),
  updated_at timestamptz not null default now()
);

create index idx_diagram_snapshots_jsonb
  on diagram_snapshots
  using gin (latest_draft_jsonb);
```

字段说明：

- `latest_draft_jsonb`：完整 `Diagram` JSON
- `schema_version`：数据结构版本号，用于迁移

### 4.4 diagram_revisions

保存版本历史。

```sql
create table diagram_revisions (
  id uuid primary key,
  diagram_id uuid not null references diagrams(id) on delete cascade,
  version integer not null,
  content_jsonb jsonb not null,
  content_hash text not null,
  source text not null,
  change_summary text null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  constraint diagram_revisions_source_check
    check (source in ('autosave', 'manual_save', 'import', 'publish', 'restore')),
  constraint diagram_revisions_version_unique
    unique (diagram_id, version)
);

create index idx_diagram_revisions_diagram_created
  on diagram_revisions(diagram_id, created_at desc);
```

字段说明：

- `version`：文档版本号
- `content_hash`：用于去重、审计、冲突辅助分析
- `source`：记录版本来源

### 4.5 diagram_members

如果后续需要共享和权限控制，建议补充此表。

```sql
create table diagram_members (
  diagram_id uuid not null references diagrams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (diagram_id, user_id),
  constraint diagram_members_role_check
    check (role in ('owner', 'editor', 'viewer'))
);
```

## 5. JSON 存储结构建议

数据库中的 `latest_draft_jsonb` 和 `content_jsonb` 直接保存当前前端 `Diagram` 结构，不建议第一版改造为关系型节点表。

示意：

```json
{
  "meta": {
    "title": "Knowledge Workflow",
    "locale": "zh-CN",
    "version": "0.1.0"
  },
  "theme": {},
  "lanes": [],
  "nodes": [],
  "edges": []
}
```

建议增加一层服务端包装字段，但不污染前端运行态模型：

```json
{
  "schemaVersion": "1.0",
  "diagram": {
    "meta": {},
    "theme": {},
    "lanes": [],
    "nodes": [],
    "edges": []
  }
}
```

优点：

- 后端可以做迁移
- 前端模型改动最小
- 不影响现有 JSON 导入导出能力

## 6. API 设计

## 6.1 新建图

`POST /api/diagrams`

请求体：

```json
{
  "title": "Knowledge Workflow",
  "initialDiagram": {
    "meta": {
      "title": "Knowledge Workflow",
      "locale": "zh-CN",
      "version": "0.1.0"
    },
    "theme": {},
    "lanes": [],
    "nodes": [],
    "edges": []
  }
}
```

返回：

```json
{
  "id": "diagram_xxx",
  "title": "Knowledge Workflow",
  "latestVersion": 1,
  "diagram": {}
}
```

## 6.2 获取图当前草稿

`GET /api/diagrams/:diagramId`

返回：

```json
{
  "id": "diagram_xxx",
  "title": "Knowledge Workflow",
  "status": "draft",
  "latestVersion": 7,
  "schemaVersion": "1.0",
  "diagram": {}
}
```

## 6.3 自动保存当前草稿

`PUT /api/diagrams/:diagramId/draft`

请求体：

```json
{
  "baseVersion": 7,
  "schemaVersion": "1.0",
  "diagram": {}
}
```

成功返回：

```json
{
  "ok": true,
  "latestVersion": 8,
  "savedAt": "2026-05-03T12:00:00Z"
}
```

若版本冲突：

```json
{
  "ok": false,
  "code": "VERSION_CONFLICT",
  "latestVersion": 9,
  "message": "Draft has been updated by another session."
}
```

## 6.4 手动保存一个版本

`POST /api/diagrams/:diagramId/revisions`

请求体：

```json
{
  "baseVersion": 8,
  "schemaVersion": "1.0",
  "diagram": {},
  "changeSummary": "调整第二泳道流程结构"
}
```

返回：

```json
{
  "revisionId": "rev_xxx",
  "version": 9,
  "createdAt": "2026-05-03T12:10:00Z"
}
```

## 6.5 获取版本历史

`GET /api/diagrams/:diagramId/revisions`

返回：

```json
{
  "items": [
    {
      "revisionId": "rev_1",
      "version": 3,
      "source": "manual_save",
      "changeSummary": "初版结构",
      "createdAt": "2026-05-02T10:00:00Z",
      "createdBy": {
        "id": "user_1",
        "name": "Alice"
      }
    }
  ]
}
```

## 6.6 恢复某个版本

`POST /api/diagrams/:diagramId/restore/:revisionId`

请求体：

```json
{
  "baseVersion": 9
}
```

返回：

```json
{
  "ok": true,
  "latestVersion": 10,
  "diagram": {}
}
```

## 6.7 图列表

`GET /api/diagrams?keyword=workflow&page=1&pageSize=20`

返回：

```json
{
  "items": [
    {
      "id": "diagram_xxx",
      "title": "Knowledge Workflow",
      "status": "draft",
      "updatedAt": "2026-05-03T12:00:00Z",
      "owner": {
        "id": "user_1",
        "name": "Alice"
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

## 7. 并发与冲突策略

第一版不建议直接上实时协同，建议使用乐观锁。

规则：

1. 前端拉取文档时拿到 `latestVersion`
2. 后续保存时带 `baseVersion`
3. 后端仅允许基于最新版本提交
4. 若版本落后，返回 `409 Conflict`
5. 前端提示用户刷新、覆盖或另存

这种机制足以解决：

- 同一用户多标签页覆盖
- 多人编辑同一图时的无提示丢失

## 8. 前端改造方案

## 8.1 代码分层建议

当前 `App.tsx` 中混合了：

- 编辑状态
- 本地持久化
- 导入导出

建议拆出存储层：

```text
app/src/storage/
  diagramApi.ts
  draftCache.ts
  persistenceService.ts
  migrations.ts
```

职责建议：

- `diagramApi.ts`
  - 负责 HTTP 请求
- `draftCache.ts`
  - 负责 `localStorage` 或 `IndexedDB` 本地缓存
- `persistenceService.ts`
  - 统一管理初始化、自动保存、冲突处理、离线回退
- `migrations.ts`
  - 负责旧数据结构迁移

## 8.2 初始化流程

推荐启动流程：

1. 从 URL 或当前上下文获取 `diagramId`
2. 调后端拉取最新草稿
3. 若成功，以数据库数据为准
4. 若失败，再尝试本地缓存
5. 若本地缓存也没有，则回退默认示例图

## 8.3 自动保存流程

推荐自动保存链路：

1. 用户编辑后立即更新 React state
2. 由 `debounce(500~1000ms)` 触发保存
3. 保存请求写到后端 `PUT /draft`
4. 成功后更新 `latestVersion`
5. 同步更新本地缓存
6. 失败时写入本地待同步队列

## 8.4 离线兜底

推荐保留本地缓存，但角色从“主存”改为“兜底”：

- 网络正常时，本地只存最近一次成功快照
- 网络失败时，本地存 `pending draft`
- 网络恢复后自动重试上传

## 8.5 UI 需要补充的状态

前端建议增加以下状态反馈：

- `saving`
- `saved`
- `saveError`
- `offlineDraft`
- `versionConflict`

否则切到数据库后，用户对保存状态没有感知。

## 9. 后端保存逻辑建议

## 9.1 自动保存

自动保存只更新：

- `diagrams.latest_version`
- `diagrams.updated_at`
- `diagram_snapshots.latest_draft_jsonb`
- `diagram_snapshots.updated_at`

并按策略决定是否写历史版本：

- 每次自动保存都写 revision：不推荐，版本噪声太大
- 定时抽样写 revision：可选
- 仅手动保存 / 导入 / 恢复时写 revision：推荐

## 9.2 手动保存版本

手动保存时：

1. 校验 `baseVersion`
2. 将当前图保存到 `diagram_revisions`
3. 更新 `diagrams.current_revision_id`
4. 更新 `diagrams.latest_version`
5. 更新 `diagram_snapshots`

## 9.3 恢复版本

恢复不是“回退数据库历史”，而是：

1. 读取某个 revision
2. 将其内容复制为当前最新 draft
3. 增加一个新版本号
4. 记录 `source = restore`

这样审计链路更清楚。

## 10. 数据迁移策略

当前前端模型中已有 `meta.version`，但它更像编辑器数据版本，不足以支撑数据库迁移。

建议新增：

- `schemaVersion`
- 后端迁移器

后端读取旧格式数据时：

1. 检查 `schemaVersion`
2. 若版本旧，则执行迁移函数
3. 迁移完成后再返回前端

示例：

- `1.0 -> 1.1`：新增节点扩展字段
- `1.1 -> 1.2`：将旧主题字段映射到新主题结构

## 11. 性能与可扩展建议

### 11.1 第一阶段

只保存整包 `Diagram JSON`，不做节点级局部写入。

优点：

- 实现简单
- 与当前前端一致
- 导入导出无额外转换成本

### 11.2 第二阶段

如果后续出现这些需求，再补派生结构：

- 按节点标签搜索
- 统计某类节点数量
- 按主题筛选图
- 大规模列表检索

此时可增加：

- `node_count`
- `lane_count`
- `edge_count`
- `theme_name`
- `locale`

这些字段可以由后端保存时同步写入 `diagrams`，作为查询索引，而不是一开始就把图结构全面关系化。

## 12. 实施路线

### 阶段一：最小可落地版本

- 新增 PostgreSQL 表
- 建立 `GET /diagrams/:id`、`PUT /draft`
- 前端接入数据库读取与自动保存
- 保留本地缓存兜底

### 阶段二：文档化与版本能力

- 增加图列表
- 增加手动保存版本
- 增加版本历史和恢复
- 增加乐观锁冲突提示

### 阶段三：协作与权限

- 用户体系
- 共享与成员角色
- 审计日志
- 评论、协同、锁定提示

## 13. 最终推荐

对于当前项目，最合适的数据库存储升级路径是：

- 用 `PostgreSQL` 做主存
- 用 `JSONB` 保存完整 `Diagram`
- 用 `diagram_snapshots` 存当前草稿
- 用 `diagram_revisions` 存历史版本
- 用 `latestVersion + baseVersion` 做乐观锁
- 保留 `localStorage` 作为离线和失败兜底

这样能最大限度复用现有前端模型和导入导出逻辑，同时为后续多文档、版本历史和团队协作留出足够空间。
