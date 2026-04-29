# Workflow Tool JSON 数据规范

本文档定义 `Workflow Tool` 导入 JSON 的数据结构规范。

适用场景：

- 编辑器导入流程图数据
- 外部系统生成符合规范的流程图 JSON
- 开发和联调用例编写

## 1. 顶层结构

导入 JSON 必须是一个对象，包含以下字段：

- `meta`
- `theme`
- `lanes`
- `nodes`
- `edges`

示例：

```json
{
  "meta": {},
  "theme": {},
  "lanes": [],
  "nodes": [],
  "edges": []
}
```

## 2. 数据类型定义

### 2.1 `meta`

```json
{
  "title": "Knowledge Workflow",
  "locale": "zh-CN",
  "version": "0.1.0"
}
```

字段说明：

- `title`: `string`，画布标题
- `locale`: `string`，仅允许：
  - `zh-CN`
  - `en-US`
- `version`: `string`，版本号字符串

### 2.2 `theme`

```json
{
  "name": "Accenture Purple",
  "bgPrimary": "#ffffff",
  "boardBackground": "linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.74))",
  "laneBackground": "linear-gradient(90deg, rgba(125,44,255,0.05), rgba(255,255,255,0.72) 24%, rgba(255,255,255,0.84) 100%)",
  "textPrimary": "#0b0b0f",
  "textMuted": "#555563",
  "accent": "#7d2cff",
  "accentDeep": "#5b16c7",
  "accentSoft": "rgba(125, 44, 255, 0.08)",
  "lineSoft": "rgba(11, 11, 15, 0.28)"
}
```

字段说明：

- `name`: `string`，主题名称
- `bgPrimary`: `string`，主背景色
- `boardBackground`: `string`，画布背景 CSS 值
- `laneBackground`: `string`，泳道背景 CSS 值
- `textPrimary`: `string`，主文字颜色
- `textMuted`: `string`，辅助文字颜色
- `accent`: `string`，主题色
- `accentDeep`: `string`，深主题色
- `accentSoft`: `string`，浅主题色
- `lineSoft`: `string`，弱化连线颜色

### 2.3 `lanes`

`lanes` 必须是数组，且至少包含 1 个元素。

```json
[
  {
    "id": "lane-1",
    "title": "Ontology Design",
    "subtitle": "type schema generation",
    "order": 0
  }
]
```

字段说明：

- `id`: `string`，泳道唯一标识
- `title`: `string`，泳道主标题
- `subtitle`: `string`，泳道附标题
- `order`: `number`，泳道顺序，数字越小越靠上

导入时行为：

- 编辑器会按 `order` 从小到大排序

### 2.4 `nodes`

`nodes` 必须是数组。

```json
[
  {
    "id": "node-1",
    "laneId": "lane-1",
    "type": "default",
    "title": "Expert Analysis",
    "description": "Experts define business concepts.",
    "tag": "business input",
    "x": 3,
    "y": 12,
    "width": 18,
    "height": 18
  }
]
```

字段说明：

- `id`: `string`，节点唯一标识
- `laneId`: `string`，所属泳道 `id`
- `type`: `string`，仅允许：
  - `default`
  - `agent`
  - `shared`
  - `output`
- `title`: `string`，节点标题
- `description`: `string`，节点描述
- `tag`: `string`，节点标签，可为空字符串
- `x`: `number`，节点左侧位置，百分比
- `y`: `number`，节点顶部位置，百分比
- `width`: `number`，节点宽度，百分比
- `height`: `number`，节点高度，百分比

约定：

- `x/y/width/height` 使用百分比坐标
- 画布设计坐标系为 `1600 x 900`

导入时行为：

- 如果 `laneId` 对应的泳道不存在，则自动归入第一个泳道

### 2.5 `edges`

`edges` 必须是数组。

```json
[
  {
    "id": "edge-1",
    "fromNodeId": "node-1",
    "toNodeId": "node-2",
    "emphasis": "theme"
  }
]
```

字段说明：

- `id`: `string`，连线唯一标识
- `fromNodeId`: `string`，起点节点 `id`
- `toNodeId`: `string`，终点节点 `id`
- `emphasis`: `string`，仅允许：
  - `soft`
  - `theme`

导入时行为：

- 如果起点或终点节点不存在，该连线会被忽略
- 如果 `fromNodeId === toNodeId`，该连线会被忽略

## 3. 导入校验规则

当前编辑器在导入时执行以下校验：

### 3.1 严格校验

以下字段必须存在且类型正确，否则导入失败：

- `meta.title`
- `meta.locale`
- `meta.version`
- `theme.*` 全部字段
- `lane.id`
- `lane.title`
- `lane.subtitle`
- `lane.order`
- `node.id`
- `node.laneId`
- `node.type`
- `node.title`
- `node.description`
- `node.tag`
- `node.x`
- `node.y`
- `node.width`
- `node.height`
- `edge.id`
- `edge.fromNodeId`
- `edge.toNodeId`
- `edge.emphasis`

### 3.2 合法值限制

- `meta.locale` 只能是 `zh-CN` 或 `en-US`
- `node.type` 只能是 `default / agent / shared / output`
- `edge.emphasis` 只能是 `soft / theme`
- `lanes` 至少要有 1 条

### 3.3 自动修正规则

- `lanes` 会按 `order` 排序
- 节点 `laneId` 无效时，自动归入第一条泳道
- 无效连线会被过滤掉

## 4. 完整示例

```json
{
  "meta": {
    "title": "Knowledge Workflow",
    "locale": "zh-CN",
    "version": "0.1.0"
  },
  "theme": {
    "name": "Accenture Purple",
    "bgPrimary": "#ffffff",
    "boardBackground": "linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.74))",
    "laneBackground": "linear-gradient(90deg, rgba(125,44,255,0.05), rgba(255,255,255,0.72) 24%, rgba(255,255,255,0.84) 100%)",
    "textPrimary": "#0b0b0f",
    "textMuted": "#555563",
    "accent": "#7d2cff",
    "accentDeep": "#5b16c7",
    "accentSoft": "rgba(125, 44, 255, 0.08)",
    "lineSoft": "rgba(11, 11, 15, 0.28)"
  },
  "lanes": [
    {
      "id": "lane-1",
      "title": "Ontology Design",
      "subtitle": "type schema generation",
      "order": 0
    },
    {
      "id": "lane-2",
      "title": "Instance Extraction",
      "subtitle": "instance graph creation",
      "order": 1
    }
  ],
  "nodes": [
    {
      "id": "node-1",
      "laneId": "lane-1",
      "type": "default",
      "title": "Expert Analysis",
      "description": "Experts define business concepts, boundaries, and constraints before instance creation.",
      "tag": "business input",
      "x": 3,
      "y": 12,
      "width": 18,
      "height": 18
    },
    {
      "id": "node-2",
      "laneId": "lane-1",
      "type": "agent",
      "title": "Instance Analysis Agent",
      "description": "Converts business analysis into a structured ontology type design.",
      "tag": "analysis agent",
      "x": 26,
      "y": 12,
      "width": 19,
      "height": 18
    },
    {
      "id": "node-3",
      "laneId": "lane-2",
      "type": "output",
      "title": "Ontology Instance Graph",
      "description": "Outputs the instance graph with traceable knowledge evidence.",
      "tag": "instance graph",
      "x": 70,
      "y": 62,
      "width": 19,
      "height": 18
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "fromNodeId": "node-1",
      "toNodeId": "node-2",
      "emphasis": "theme"
    },
    {
      "id": "edge-2",
      "fromNodeId": "node-2",
      "toNodeId": "node-3",
      "emphasis": "soft"
    }
  ]
}
```

## 5. 生成建议

如果你要从外部系统自动生成导入 JSON，建议遵循以下规则：

- `id` 使用稳定唯一值
- `order` 从 `0` 开始递增
- `tag` 没有内容时传空字符串 `""`
- `x/y/width/height` 统一使用数字，不要使用字符串
- `fromNodeId` 和 `toNodeId` 必须引用已有节点
- 不要生成自连线

## 6. 对应源码

规范对应的实现文件：

- `app/src/model/diagram.ts`
- `app/src/utils/json.ts`

