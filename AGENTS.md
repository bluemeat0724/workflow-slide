# AGENTS.md

## Purpose

This repository contains a workflow editor prototype. The main app lives in `app/` and combines:

- a React 19 + TypeScript + Vite frontend with i18n (zh-CN / en-US)
- a Node.js HTTP API in `app/server/`
- PostgreSQL or SQLite persistence for remote diagram storage and revision history
- an AI workflow agent that generates diagrams from natural language descriptions

The top-level `README.md` is minimal, so use this file as the working guide for code agents.

## Repository Layout

- `app/src/`: frontend application code
- `app/src/components/agent/`: AI workflow agent chat UI (launcher, window, message list)
- `app/src/components/canvas/`: interactive diagram canvas with drag, resize, and edge creation
- `app/src/components/inspector/`: property editor for canvas, lanes, nodes, edges, and themes
- `app/src/components/sidebar/`: lane/node outline and quick-add controls
- `app/src/components/toolbar/`: language switch, import/export, remote operations
- `app/src/components/library/`: remote diagram list and revision history browser
- `app/src/editor/`: reducer-driven editor state and tests
- `app/src/api/client.ts`: frontend API client
- `app/src/api/contracts.ts`: shared types for API requests, responses, and agent messages
- `app/src/storage/persistenceService.ts`: autosave, local cache, remote sync, conflict handling
- `app/src/model/diagram.ts`: core diagram domain types (Diagram, Node, Edge, Lane, Theme, etc.)
- `app/src/data/`: empty diagram factory, default fixtures, theme presets
- `app/src/config/runtime.ts`: runtime capability detection (remote API, database support)
- `app/src/i18n/`: localized message strings (zh-CN, en-US)
- `app/src/utils/`: geometry helpers, theme builders, section labels, JSON/HTML export, download
- `app/src/styles/`: base and editor CSS
- `app/server/`: backend entrypoint, config, DB setup, and migrations
- `app/server/ai/`: workflow agent — conversation orchestrator, JSON sub-agent, diagram normalizer, layout engine, session store, theme presets
- `app/server/repository/`: PostgreSQL and SQLite diagram repository implementations
- `dev_docs/`: design notes, API contracts, and agent plans

Do not spend time editing generated or dependency directories such as `app/node_modules/` or `app/dist/`.

## Setup And Commands

Run all app commands from `app/`.

| Command | Purpose |
|---|---|
| `npm install` | install dependencies |
| `npm run dev` | start Vite frontend (local-only mode) |
| `npm run dev:local-only` | start Vite frontend (local-only mode) |
| `npm run dev:remote` | start Vite frontend (remote API mode) |
| `npm run server` | start backend with `.env` |
| `npm run server:dev` | start backend in watch mode |
| `npm run db:migrate` | apply PostgreSQL migrations |
| `npm run db:migrate:sqlite` | apply SQLite migrations |
| `npm run dev:local-db` | start local SQLite development helper |
| `npm run test` | run Vitest |
| `npm run lint` | run ESLint |
| `npm run build` | type-check and build the frontend |

Backend environment variables are documented in `app/.env.example`.

## Key Dependencies

- **Frontend**: React 19, Vite 5, TypeScript 6
- **Backend**: Node.js built-in `http`, `pg` (PostgreSQL), `better-sqlite3` (SQLite)
- **AI**: `openai` SDK (DeepSeek-compatible endpoint)
- **Testing**: Vitest, ESLint 9

## Architecture Notes

The frontend is reducer-centric. `app/src/App.tsx` wires together UI components, the editor reducer, persistence service, API client, AI agent, import/export, and i18n-aware status messaging.

Key data flow:

- [diagram.ts](file:///Users/g-air/projects/workflow-slide/app/src/model/diagram.ts) — core domain types (Diagram, Node, Edge, Lane, Theme)
- [editorState.ts](file:///Users/g-air/projects/workflow-slide/app/src/editor/editorState.ts) — state transitions and action dispatch
- [persistenceService.ts](file:///Users/g-air/projects/workflow-slide/app/src/storage/persistenceService.ts) — autosave scheduling, local cache, remote sync, version conflict resolution
- [client.ts](file:///Users/g-air/projects/workflow-slide/app/src/api/client.ts) — HTTP client for `/api`
- [contracts.ts](file:///Users/g-air/projects/workflow-slide/app/src/api/contracts.ts) — shared API types (diagrams, revisions, workflow agent)
- [index.mjs](file:///Users/g-air/projects/workflow-slide/app/server/index.mjs) — HTTP endpoints: CRUD for diagrams/revisions, workflow agent sessions
- [workflowExecutionService.mjs](file:///Users/g-air/projects/workflow-slide/app/server/ai/workflowExecutionService.mjs) — orchestrates AI conversation → JSON generation → diagram normalization

**Storage drivers**: The backend supports `STORAGE_DRIVER=postgres` (default) and `STORAGE_DRIVER=sqlite`. The frontend can run in `local-only` mode (no server) or `remote` mode (connected to backend).

**AI workflow agent**: The user describes a workflow in natural language; the backend runs a multi-turn conversation to refine the plan, then generates a diagram JSON that is validated, normalized, and returned to the frontend.

When changing persistence or API behavior, keep frontend contracts, backend responses, and any relevant docs in `dev_docs/` aligned.

## Working Agreements

- Prefer small, surgical changes. The worktree may already contain user changes.
- Check `git status` before editing and avoid reverting unrelated modifications.
- Preserve the existing style: TypeScript on the frontend, ESM `.mjs` on the backend, semicolons omitted, single quotes, concise helpers.
- Keep React code idiomatic for the current codebase. Follow existing patterns before introducing new abstractions.
- Add or update tests when changing reducer logic, persistence behavior, AI pipeline, or other logic-heavy code.
- If you touch API shapes or schema validation, verify both the client and server sides still agree.
- Treat `dev_docs/` as supporting context, not the only source of truth. Confirm behavior in code before relying on a doc.

## Validation Checklist

Choose the smallest relevant verification set for the change:

- frontend logic or UI copy: `npm run test`
- lint-sensitive edits: `npm run lint`
- build or typing risk: `npm run build`
- backend or persistence changes: run the relevant server command and confirm environment assumptions from `app/.env.example`

If a change is not covered by automated tests, state that explicitly in the handoff.

## Environment

涉及环境问题，如包依赖、环境变量等，如无法自行解决，需停止工作，交由人类解决。不要尝试通过代码绕开。

## docs updates

完成一组任务后，更新dev_docs/dev.log 和 README.md文件内容
