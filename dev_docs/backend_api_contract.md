# Workflow Tool 后端接口契约草案

## 1. 适用范围

本文档定义数据库存储方案对应的后端接口契约，目标是让前端编辑器、后端服务和后续鉴权层在字段、版本控制、错误语义上保持一致。

与 [database_storage_plan.md](/Users/g-air/projects/workflow-slide/dev_docs/database_storage_plan.md) 的关系如下：

- `database_storage_plan.md` 负责总体设计与表结构
- 本文档负责 HTTP API、字段语义、状态码和冲突处理细节

## 2. 通用约定

### 2.1 Base URL

```text
/api
```

### 2.2 Content-Type

请求与响应统一使用：

```text
application/json
```

### 2.3 鉴权

第一版默认所有接口都要求登录态，用户身份由服务端中间件解析，不通过请求体传入 `userId`。

### 2.4 时间字段

所有时间字段统一使用 ISO 8601 UTC 字符串，例如：

```text
2026-05-03T12:00:00Z
```

### 2.5 ID 约定

第一版推荐统一使用 UUID 字符串。

### 2.6 版本控制

所有会修改草稿内容的接口都需要带：

- `baseVersion`
- `schemaVersion`

规则：

- `baseVersion` 用于乐观锁
- `schemaVersion` 用于服务端迁移和兼容判断

## 3. 核心资源模型

### 3.1 DiagramDocument

当前编辑态文档结构：

```json
{
  "id": "f11b73a4-1b6f-4f5b-8ad0-2a6f6d92e9a8",
  "title": "Knowledge Workflow",
  "status": "draft",
  "latestVersion": 7,
  "schemaVersion": "1.0",
  "updatedAt": "2026-05-03T12:00:00Z",
  "diagram": {
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

### 3.2 DiagramRevision

历史版本结构：

```json
{
  "revisionId": "91f51220-49ab-4289-b960-c1a4930d838f",
  "diagramId": "f11b73a4-1b6f-4f5b-8ad0-2a6f6d92e9a8",
  "version": 9,
  "source": "manual_save",
  "changeSummary": "调整第二泳道结构",
  "createdAt": "2026-05-03T12:10:00Z",
  "createdBy": {
    "id": "8c812585-75f0-4b61-88f6-5f13377aa010",
    "name": "Alice"
  }
}
```

## 4. 接口列表

### 4.1 创建文档

`POST /api/diagrams`

请求体：

```json
{
  "title": "Knowledge Workflow",
  "schemaVersion": "1.0",
  "diagram": {
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

成功响应 `201 Created`：

```json
{
  "id": "f11b73a4-1b6f-4f5b-8ad0-2a6f6d92e9a8",
  "title": "Knowledge Workflow",
  "status": "draft",
  "latestVersion": 1,
  "schemaVersion": "1.0",
  "updatedAt": "2026-05-03T12:00:00Z",
  "diagram": {}
}
```

### 4.2 获取当前草稿

`GET /api/diagrams/:diagramId`

成功响应 `200 OK`：

```json
{
  "id": "f11b73a4-1b6f-4f5b-8ad0-2a6f6d92e9a8",
  "title": "Knowledge Workflow",
  "status": "draft",
  "latestVersion": 7,
  "schemaVersion": "1.0",
  "updatedAt": "2026-05-03T12:00:00Z",
  "diagram": {}
}
```

错误：

- `404 Not Found`：文档不存在或无权限访问

### 4.3 更新当前草稿

`PUT /api/diagrams/:diagramId/draft`

请求体：

```json
{
  "baseVersion": 7,
  "schemaVersion": "1.0",
  "diagram": {}
}
```

成功响应 `200 OK`：

```json
{
  "ok": true,
  "latestVersion": 8,
  "savedAt": "2026-05-03T12:00:00Z"
}
```

错误：

- `400 Bad Request`：请求体不合法
- `404 Not Found`：文档不存在
- `409 Conflict`：`baseVersion` 落后
- `422 Unprocessable Entity`：`diagram` 结构非法

冲突响应示例：

```json
{
  "ok": false,
  "code": "VERSION_CONFLICT",
  "message": "Draft has been updated by another session.",
  "latestVersion": 9,
  "serverDocument": {
    "id": "f11b73a4-1b6f-4f5b-8ad0-2a6f6d92e9a8",
    "title": "Knowledge Workflow",
    "status": "draft",
    "latestVersion": 9,
    "schemaVersion": "1.0",
    "updatedAt": "2026-05-03T12:01:12Z",
    "diagram": {}
  }
}
```

### 4.4 手动保存版本

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

成功响应 `201 Created`：

```json
{
  "revisionId": "91f51220-49ab-4289-b960-c1a4930d838f",
  "version": 9,
  "createdAt": "2026-05-03T12:10:00Z"
}
```

### 4.5 获取版本历史

`GET /api/diagrams/:diagramId/revisions?page=1&pageSize=20`

成功响应 `200 OK`：

```json
{
  "items": [
    {
      "revisionId": "91f51220-49ab-4289-b960-c1a4930d838f",
      "diagramId": "f11b73a4-1b6f-4f5b-8ad0-2a6f6d92e9a8",
      "version": 9,
      "source": "manual_save",
      "changeSummary": "调整第二泳道流程结构",
      "createdAt": "2026-05-03T12:10:00Z",
      "createdBy": {
        "id": "8c812585-75f0-4b61-88f6-5f13377aa010",
        "name": "Alice"
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

### 4.6 获取某个版本详情

`GET /api/diagrams/:diagramId/revisions/:revisionId`

成功响应 `200 OK`：

```json
{
  "revisionId": "91f51220-49ab-4289-b960-c1a4930d838f",
  "diagramId": "f11b73a4-1b6f-4f5b-8ad0-2a6f6d92e9a8",
  "version": 9,
  "source": "manual_save",
  "changeSummary": "调整第二泳道流程结构",
  "createdAt": "2026-05-03T12:10:00Z",
  "createdBy": {
    "id": "8c812585-75f0-4b61-88f6-5f13377aa010",
    "name": "Alice"
  },
  "schemaVersion": "1.0",
  "diagram": {}
}
```

### 4.7 恢复某个版本为当前草稿

`POST /api/diagrams/:diagramId/restore/:revisionId`

请求体：

```json
{
  "baseVersion": 9
}
```

成功响应 `200 OK`：

```json
{
  "ok": true,
  "latestVersion": 10,
  "savedAt": "2026-05-03T12:12:00Z",
  "diagram": {}
}
```

### 4.8 导入 JSON 覆盖当前草稿

`POST /api/diagrams/:diagramId/import`

请求体：

```json
{
  "baseVersion": 10,
  "schemaVersion": "1.0",
  "diagram": {}
}
```

成功响应 `200 OK`：

```json
{
  "ok": true,
  "latestVersion": 11,
  "savedAt": "2026-05-03T12:15:00Z"
}
```

说明：

- 服务端需要复用与前端 `parseDiagramJson` 等价的校验逻辑
- 导入操作应自动写入一条 `source = import` 的 revision

### 4.9 获取图列表

`GET /api/diagrams?page=1&pageSize=20&keyword=workflow&status=draft`

成功响应 `200 OK`：

```json
{
  "items": [
    {
      "id": "f11b73a4-1b6f-4f5b-8ad0-2a6f6d92e9a8",
      "title": "Knowledge Workflow",
      "status": "draft",
      "latestVersion": 11,
      "updatedAt": "2026-05-03T12:15:00Z",
      "owner": {
        "id": "8c812585-75f0-4b61-88f6-5f13377aa010",
        "name": "Alice"
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

### 4.10 软删除文档

`DELETE /api/diagrams/:diagramId`

成功响应 `204 No Content`

说明：

- 推荐做软删除，不直接清理 revision 历史

## 5. 通用错误格式

推荐所有错误统一返回：

```json
{
  "ok": false,
  "code": "VALIDATION_ERROR",
  "message": "Request body is invalid.",
  "details": {
    "field": "diagram.meta.title"
  }
}
```

建议错误码：

- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `VERSION_CONFLICT`
- `SCHEMA_VERSION_UNSUPPORTED`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

## 6. 前端调用建议

### 6.1 初始化

前端进入编辑页后：

1. 根据 `diagramId` 调 `GET /api/diagrams/:diagramId`
2. 成功后设置本地 `diagram` 与 `latestVersion`
3. 失败时可回退本地缓存

### 6.2 自动保存

前端在用户编辑后：

1. 立即更新本地 state
2. 使用 `500ms ~ 1000ms` debounce
3. 调 `PUT /draft`
4. 保存成功后刷新本地 `latestVersion`
5. 保存失败时缓存待重试草稿

### 6.3 冲突处理

若收到 `409 VERSION_CONFLICT`：

1. 弹出提示
2. 允许用户刷新服务器版本
3. 或另存为新图
4. 不建议第一版做自动 merge

## 7. 服务端校验建议

服务端不应直接信任前端 JSON，至少要校验：

- `meta.title`
- `meta.locale`
- `meta.version`
- `theme` 结构完整性
- `lanes` 至少 1 条
- `nodes` 必填字段与类型合法
- `edges` 的起止节点有效性

建议服务端与前端共享一套 schema 定义，避免前后校验漂移。

## 8. 推荐后续工作

建议按以下顺序推进：

1. 先实现 `GET /api/diagrams/:id` 和 `PUT /api/diagrams/:id/draft`
2. 再实现 `POST /api/diagrams` 与图列表
3. 最后补 revision 历史与 restore

这样可以最快把当前项目从本地草稿切到数据库主存。
