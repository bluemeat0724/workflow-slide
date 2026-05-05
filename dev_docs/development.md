# 开发与部署

## 环境变量

所有环境变量统一放在项目根目录 `.env`。`vite`、`npm run server`、`npm run db:migrate`、`docker compose` 均读取这一个文件。

## npm 启动模式

三种前端启动模式，按需选择。

### local-only — 纯前端模式

```bash
npm run dev           # 或 make dev
```

- 只启动 Vite 前端，不依赖任何后端服务
- **不支持**远端保存、图列表、版本历史等数据库功能
- **不支持** AI workflow agent（无法访问 `/api/ai/*`）
- 编辑结果仅保存在浏览器本地（localStorage），关闭浏览器后可能丢失
- 支持导出 JSON、HTML、GIF 动画（GIF 需后端 `POST /api/gif`）

### remote — 远端 API 模式

```bash
npm run dev:remote    # 或 make dev-remote
```

- 前端连接到独立的远端 API 服务器
- 需在根目录 `.env` 中配置 `VITE_STORAGE_MODE=remote` 和 `VITE_API_BASE_URL`
- 支持完整的数据库功能：远端保存、图列表、版本历史、版本恢复
- 如果远端服务器配置了 AI，则支持 AI workflow agent
- 适合：团队共用服务端、生产部署场景

### local-db — 本地数据库模式

```bash
# 首次需先执行迁移
npm run db:migrate:sqlite   # 或 make db-migrate-sqlite
npm run dev:local-db        # 或 make dev-local-db
```

- 同时启动前端和本地 Node.js 后端，使用 SQLite 存储
- 需在根目录 `.env` 中配置 `STORAGE_DRIVER=sqlite`
- 支持完整的数据库功能（本地持久化），无需外部 PostgreSQL
- 如果配置了 AI 密钥，同样支持 AI workflow agent
- 适合：单机完整开发体验

## 命令参考

所有命令在 `app/` 下执行（仓库根目录提供 `make` 快捷方式）。

| npm 命令 | Make 目标 | 说明 |
|---|---|---|
| `npm install` | `make install` | 安装依赖 |
| `npm run dev` | `make dev` | 完整开发模式（SQLite 后端 + Vite 前端） |
| `npm run dev:local-only` | `make dev-local-only` | 纯前端模式（不依赖后端） |
| `npm run dev:remote` | `make dev-remote` | 远端 API 模式 |
| `npm run dev:local-db` | `make dev-local-db` | 同 `npm run dev` |
| `npm run server` | `make server` | 启动后端（PostgreSQL 默认） |
| `npm run server:dev` | `make server-dev` | 启动后端 watch 模式 |
| `npm run db:migrate` | `make db-migrate` | 执行 PostgreSQL 迁移 |
| `npm run db:migrate:sqlite` | `make db-migrate-sqlite` | 执行 SQLite 迁移 |
| `npm run test` | `make test` | 运行 Vitest 测试 |
| `npm run lint` | `make lint` | 运行 ESLint |
| `npm run build` | `make build` | 类型检查 + 构建前端 |
| `npm run preview` | `make preview` | 预览生产构建 |

组合命令:

| Make 目标 | 说明 |
|---|---|
| `make setup` | install + db-migrate |
| `make start-local-db` | db-migrate-sqlite + dev-local-db |

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
