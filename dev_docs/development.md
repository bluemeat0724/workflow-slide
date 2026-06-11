# 开发与部署

## 环境变量

所有环境变量统一放在项目根目录 `.env`。`npm run dev`、`npm run frontend`、`npm run server`、`npm run db:migrate` 和 `docker compose` 均读取这一个文件。

数据库类型必须显式配置，且只由环境变量决定：

```dotenv
STORAGE_DRIVER=sqlite
# 或
STORAGE_DRIVER=postgres
```

缺失或配置为其他值时，服务端和迁移命令会直接报错。SQLite 仅读取 `SQLITE_FILE`；PostgreSQL 仅读取 `DATABASE_URL` 或 `DB_*`。

## 开发启动

完整开发模式：

```bash
npm run db:migrate   # 或 make migrate
npm run dev          # 或 make dev
```

`npm run dev` 同时启动 Node.js 后端和 Vite。它会保留根目录 `.env` 中的服务端配置，但会为前端开发进程强制注入 `VITE_STORAGE_MODE=local-db` 和 `VITE_API_BASE_URL=/api`，确保默认就是完整本地联调模式。

仅启动前端：

```bash
npm run frontend     # 或 make frontend
```

- `VITE_STORAGE_MODE=local-only`：浏览器本地存储，不依赖后端。
- `VITE_STORAGE_MODE=remote`：连接 `VITE_API_BASE_URL` 指定的 API。
- `VITE_STORAGE_MODE=local-db`：通过本地 `/api` 使用同时启动的后端。

## 命令参考

所有命令在 `app/` 下执行（仓库根目录提供 `make` 快捷方式）。

| npm 命令 | Make 目标 | 说明 |
|---|---|---|
| `npm install` | `make install` | 安装依赖 |
| `npm run dev` | `make dev` | 按根目录 `.env` 启动后端 + Vite |
| `npm run frontend` | `make frontend` | 按根目录 `.env` 仅启动 Vite |
| `npm run server` | `make server` | 按 `STORAGE_DRIVER` 启动后端 |
| `npm run server:dev` | `make server-dev` | 启动后端 watch 模式 |
| `npm run db:migrate` | `make migrate` | 按 `STORAGE_DRIVER` 执行迁移 |
| `npm run test` | `make test` | 运行 Vitest 测试 |
| `npm run lint` | `make lint` | 运行 ESLint |
| `npm run build` | `make build` | 类型检查 + 构建前端 |
| `npm run preview` | `make preview` | 预览生产构建 |

## Docker 部署

仓库根目录提供了基于 `profiles` 的 `docker-compose.yml`，支持 4 种部署模式；默认通过 `.env` 里的 `COMPOSE_PROFILES=sqlite` 启动 SQLite 组合。

### 1. 默认模式: frontend + server + SQLite

```bash
cp .env.example .env
docker compose up --build -d
```

启动服务：

- `frontend-sqlite`：静态前端容器
- `server-sqlite`：Node.js API，使用 `/app/data/workflow-tool.sqlite`

说明：

- 前端构建为 `VITE_STORAGE_MODE=remote`
- 前端容器内 Nginx 会把 `/api/*` 反代到 `server-sqlite:3103`
- SQLite 数据通过 compose volume `sqlite_data` 持久化
- server 容器启动时会自动执行 SQLite migration

### 2. frontend + server + PostgreSQL

```bash
cp .env.example .env
COMPOSE_PROFILES=pg docker compose up --build -d
```

启动服务：

- `frontend-pg`：静态前端容器，对外暴露 `http://127.0.0.1:${FRONTEND_PORT:-8080}`
- `server-pg`：Node.js API，对外暴露 `http://127.0.0.1:${SERVER_PORT:-3103}`
- `postgres`：PostgreSQL 持久化存储

说明：

- 前端同样构建为 `VITE_STORAGE_MODE=remote`
- 前端容器内 Nginx 会把 `/api/*` 反代到 `server-pg:3103`
- server 容器启动时会自动执行 PostgreSQL migration

### 3. frontend + server + 外部 PostgreSQL (remote-db)

```bash
cp .env.example .env
# 在 .env 中配置 DATABASE_URL 指向外部 PostgreSQL
COMPOSE_PROFILES=remote-db docker compose up --build -d
```

启动服务：

- `frontend-remote-db`：静态前端容器，对外暴露 `http://127.0.0.1:${FRONTEND_PORT:-8080}`
- `server-remote-db`：Node.js API，对外暴露 `http://127.0.0.1:${SERVER_PORT:-3103}`

说明：

- **不启动 PostgreSQL 容器**，依赖外部已有数据库
- 通过 `DATABASE_URL` 环境变量指定数据库连接（也支持 `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` 分字段配置）
- 前端同样构建为 `VITE_STORAGE_MODE=remote`
- 前端容器内 Nginx 会把 `/api/*` 反代到 `server-remote-db:3103`
- server 容器启动时会自动执行 PostgreSQL migration，确保表结构存在
- 适用于已有托管 PostgreSQL（如 RDS、PolarDB 等）的生产或预发布环境

### 4. frontend only

```bash
cp .env.example .env
COMPOSE_PROFILES=front-only docker compose up --build -d
```

说明：

- 仅启动 `frontend-only`
- 前端构建为 `VITE_STORAGE_MODE=local-only`
- 不依赖 server、PostgreSQL 或 SQLite
- 不支持远端保存、版本历史、AI workflow agent、GIF 导出等服务端能力

### 通用说明

- 四种 profile 共享同一个根目录 `.env`
- `FRONTEND_PORT` 控制前端对外端口，默认 `8080`
- `SERVER_PORT` 控制 API 对外端口，默认 `3103`
- `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` 仅用于 `pg` profile 构建 PostgreSQL 容器
- `DATABASE_URL`（或 `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`）用于 `remote-db` profile 连接外部 PostgreSQL
- `COMPOSE_PROFILES=sqlite` 时，`docker compose up --build -d` 会默认启动 SQLite 组合
- 不要同时启用多个 profile；它们会竞争同一组端口
- 后端镜像基于 Playwright 官方运行时，避免 GIF 导出缺少 Chromium 或系统库
- 前端镜像基于 Nginx，仅负责静态资源和 SPA fallback；`remote` 模式下再额外反代 `/api`
