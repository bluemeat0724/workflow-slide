# Workflow Tool

Section 式流程图编辑器，支持本地草稿编辑、本地数据库存储和远端服务连接三种模式。

## 启动模式

项目支持三种启动模式，通过命令或环境变量切换：

| 模式 | 命令 | 数据库 | 图列表 | 版本历史 |
|---|---|---|---|---|
| `local-only` | `npm run dev` 或 `npm run dev:local-only` | 无 | 隐藏 | 隐藏 |
| `remote` | `npm run dev:remote` | 远端 PostgreSQL | 可用 | 可用 |
| `local-db` | `npm run dev:local-db` | 本地 SQLite | 可用 | 可用 |

### 1. local-only（默认）

仅启动前端，不连接任何数据库。适合快速编辑和导出流程图。

- 可编辑流程图、导出 JSON/HTML
- 浏览器本地草稿自动恢复
- 不支持保存到数据库
- 图列表、版本历史等入口隐藏

```bash
npm run dev
# 或
npm run dev:local-only
```

### 2. remote

仅启动前端，通过配置的远端 API 地址访问数据库服务。

```bash
# 在 .env 中设置：
# VITE_STORAGE_MODE=remote
# VITE_API_BASE_URL=https://your-server.com/api

npm run dev:remote
```

### 3. local-db

同时启动前端和本地 server，server 使用 SQLite 存储数据。

```bash
# 在 .env 中设置：
# STORAGE_DRIVER=sqlite

npm run dev:local-db
```

首次运行前执行 SQLite 数据库迁移：

```bash
npm run db:migrate:sqlite
```

## 环境变量

所有配置详见 `app/.env.example`。

### 前端

| 变量 | 说明 | 可选值 |
|---|---|---|
| `VITE_STORAGE_MODE` | 启动模式 | `local-only` / `remote` / `local-db` |
| `VITE_API_BASE_URL` | API 服务地址 | `/api` 或完整 URL |

### 后端

| 变量 | 说明 | 可选值 |
|---|---|---|
| `STORAGE_DRIVER` | 存储驱动 | `postgres` / `sqlite` |
| `DATABASE_URL` | PostgreSQL 连接串 | |
| `SQLITE_FILE` | SQLite 文件路径 | 默认 `./data/workflow-tool.sqlite` |
| `PORT` | 服务端口 | 默认 `3103` |

## 快速开始

```bash
# 安装依赖
cd app
npm install

# 启动开发模式（local-only）
npm run dev

# 或使用本地 SQLite 数据库
npm run db:migrate:sqlite
npm run dev:local-db
```

## 可用脚本

所有命令在 `app/` 目录下运行：

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动前端（local-only 模式） |
| `npm run dev:local-only` | 启动前端（仅本地草稿） |
| `npm run dev:remote` | 启动前端（连接远端 API） |
| `npm run dev:local-db` | 启动前端 + 本地 SQLite server |
| `npm run server` | 启动后端 server |
| `npm run server:dev` | 启动后端 server（watch 模式） |
| `npm run db:migrate` | 执行 PostgreSQL 数据库迁移 |
| `npm run db:migrate:sqlite` | 执行 SQLite 数据库迁移 |
| `npm run build` | 类型检查并构建前端 |
| `npm run lint` | 运行 ESLint |
| `npm run test` | 运行测试 |

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **后端**: Node.js HTTP API (`app/server/`)
- **数据库**: PostgreSQL（remote 模式）/ SQLite（local-db 模式）
- **存储抽象**: Repository 模式 (`app/server/repository/`)
