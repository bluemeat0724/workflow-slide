# Workflow Tool

一个用于创建横向泳道式流程图的前端编辑器。

当前项目目标是让用户在浏览器内完成以下操作：

- 新增泳道
- 新增节点
- 拖拽节点位置
- 调整节点宽度
- 编辑节点文字
- 创建节点间连线
- 配置整体主题
- 导出独立 HTML
- 导出和导入 JSON

## 参考文件

当前样式参考仅来自以下两个成品文件：

- `knowledge_creation.html`
- `knowledge_consumption.html`

## 当前目录结构

```text
workflow_tool/
  app/                     前端编辑器工程
  knowledge_creation.html  参考成品
  knowledge_consumption.html
  workflow_editor_plan.md  规划文档
  dev.log                  开发记录
  README.md                项目说明
```

## 技术栈

- `Vite`
- `React`
- `TypeScript`
- 原生 `SVG` 连线
- 原生 `HTML + CSS` 节点与泳道渲染

## 已实现功能

- 横向泳道布局
- 默认单泳道，可新增和删除泳道
- 泳道主标题、附标题编辑
- 节点新增、删除
- 节点拖拽移动
- 节点跨泳道自动更新归属
- 节点宽度拖曳调整
- 节点高度基于实际内容自动适配
- 自动连线
- 连线强调状态切换：灰色 / 主题色
- 右侧属性面板编辑
- 画布内拖线创建连线
- 双击节点原位编辑文字
- 中英文界面切换
- JSON 导出
- JSON 导入和基础校验
- 独立 HTML 单文件导出
- 主题编辑：背景、文字、主题色、深主题色

## 当前交互方式

### 画布

- 拖动节点卡片：移动节点
- 拖动节点右侧手柄：调整节点宽度
- 拖动节点左侧圆点到另一个节点：创建连线
- 双击节点：原位编辑标题、描述、标签

### 左侧结构区

- 新增泳道
- 新增节点
- 查看并选择泳道、节点、连线

### 右侧属性区

- 编辑画布标题
- 编辑主题名称和颜色
- 编辑泳道标题和附标题
- 编辑节点标题、描述、标签、类型
- 编辑连线强调状态
- 删除泳道、节点、连线

### 顶部工具栏

- 切换中英文界面
- 导入 JSON
- 导出 JSON
- 导出 HTML

## 运行方式

进入前端工程目录：

```bash
cd app
```

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

构建生产版本：

```bash
npm run build
```

代码检查：

```bash
npm run lint
```

## 数据结构

核心图数据结构位于：

- `app/src/model/diagram.ts`

核心结构包括：

- `Diagram`
- `Theme`
- `Lane`
- `Node`
- `Edge`

其中：

- 节点位置和尺寸采用百分比保存
- 画布使用固定设计坐标系 `1600 x 900`
- 连线路径运行时自动计算

## 导出说明

### JSON

用于保存当前编辑状态，并可重新导入继续编辑。

### HTML

导出为独立单文件，打开即可预览，不依赖编辑器运行时。

## 主要源码位置

- `app/src/App.tsx`：编辑器主状态与操作入口
- `app/src/components/canvas/Canvas.tsx`：画布、节点、连线交互
- `app/src/components/inspector/Inspector.tsx`：右侧属性面板
- `app/src/components/sidebar/Sidebar.tsx`：左侧结构区
- `app/src/components/toolbar/Toolbar.tsx`：顶部工具栏
- `app/src/utils/geometry.ts`：坐标、泳道和连线路径计算
- `app/src/utils/json.ts`：JSON 导入导出
- `app/src/utils/exportHtml.ts`：HTML 导出
- `app/src/utils/theme.ts`：主题派生与变量映射

## 当前限制

- 不支持自动智能排版
- 不支持手工编辑连线路径
- 不支持多人协作
- 不支持历史版本
- 不支持批量多选编辑
- 目前仍以横向泳道式流程图为唯一布局

## 当前状态

当前工程已可运行，并已通过：

- `npm run build`
- `npm run lint`

## 补充文档

- `workflow_editor_plan.md`：完整规划与开发清单
- `dev.log`：简要开发记录
