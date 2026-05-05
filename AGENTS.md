# AGENTS.md

## Purpose

This repository contains a workflow editor. The main app lives in `app/` and combines:

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
- `app/src/components/toolbar/`: language switch, import/export, remote operations, GIF export trigger
- `app/src/components/library/`: remote diagram list and revision history browser
- `app/src/editor/`: reducer-driven editor state and tests
- `app/src/hooks/useWorkflowAgent.ts`: workflow agent chat state management hook
- `app/src/hooks/useCanvasInteraction.ts`: canvas pointer interaction management (drag, resize, connect)
- `app/src/hooks/useDiagramLibrary.ts`: diagram library UI hook
- `app/src/api/client.ts`: frontend API client
- `app/src/api/contracts.ts`: shared types for API requests, responses, and agent messages
- `app/src/storage/persistenceService.ts`: autosave, local cache, remote sync, conflict handling
- `app/src/storage/persistenceService.test.ts`: persistence service test coverage
- `app/src/model/diagram.ts`: core diagram domain types (Diagram, Node, Edge, Lane, Theme, etc.)
- `app/src/data/`: empty diagram factory, default fixtures, theme presets
- `app/src/config/runtime.ts`: runtime capability detection (remote API, database support)
- `app/src/i18n/`: localized message strings (zh-CN, en-US)
- `app/src/utils/`: geometry helpers, theme builders, section labels, JSON/HTML/GIF export, download, edge animation engine, agent UI helpers
- `app/src/styles/`: base, editor, and agent CSS
- `app/shared/themePresetDefs.json`: single source of truth for theme preset definitions shared by frontend and backend
- `app/server/`: backend entrypoint, config, DB setup, migrations, schema validation, HTTP routes
- `app/server/routes.mjs`: route definitions extracted from index.mjs
- `app/server/ai/`: workflow agent — conversation orchestrator, JSON sub-agent, diagram normalizer, layout engine, session store, theme presets, prompt templates, OpenAI client wrapper, error taxonomy, JSON fence parser, diagnostics
- `app/server/render/`: GIF export — browser capture (Playwright), GIF encoder, export templates, presentation profiles, edge animation planning, legacy canvas renderer
- `app/server/repository/`: PostgreSQL and SQLite diagram repository implementations with shared helpers
- `app/scripts/`: dev startup orchestrator (`dev-local-db.mjs`), Docker entrypoint
- `dev_docs/`: design notes, API contracts, agent plans, code optimization plan, legacy plans, and [development guide](file:///Users/g-air/projects/workflow-slide/dev_docs/development.md)
- `Makefile` (root): convenience shortcuts for all npm commands

Do not spend time editing generated or dependency directories such as `app/node_modules/` or `app/dist/`.

## Setup And Commands

All commands run from `app/` (use `make <target>` from repo root as shortcut).

See [dev_docs/development.md](file:///Users/g-air/projects/workflow-slide/dev_docs/development.md) for:
- Environment variable setup (single `.env` at repo root, consumed by all tools)
- npm start modes (local-only / remote / local-db) with capability breakdowns
- Backend and database commands (server, migrations, watch mode)
- Docker Compose deployment (3 profiles: SQLite, PostgreSQL, frontend-only)
- Makefile shortcut reference

Quick reference:

| Command | Purpose |
|---|---|
| `npm install` | install dependencies |
| `npm run dev` | full dev (SQLite backend + Vite frontend) |
| `npm run test` | run Vitest |
| `npm run lint` | run ESLint |
| `npm run build` | type-check and build the frontend |

## Key Dependencies

- **Frontend**: React 19, Vite 8, TypeScript 6
- **Backend**: Node.js built-in `http`, `pg` (PostgreSQL), `better-sqlite3` (SQLite)
- **GIF Export**: `@napi-rs/canvas`, `playwright` (browser-based capture), `gifenc`
- **AI**: `openai` SDK (DeepSeek-compatible endpoint)
- **Testing**: Vitest, ESLint 9

## Architecture Notes

The frontend is reducer-centric. `app/src/App.tsx` wires together UI components, the editor reducer, persistence service, API client, AI agent, import/export (JSON/HTML/GIF), and i18n-aware status messaging.

Key data flow:

- [diagram.ts](file:///Users/g-air/projects/workflow-slide/app/src/model/diagram.ts) — core domain types (Diagram, Node, Edge, Lane, Theme)
- [editorState.ts](file:///Users/g-air/projects/workflow-slide/app/src/editor/editorState.ts) — state transitions and action dispatch
- [persistenceService.ts](file:///Users/g-air/projects/workflow-slide/app/src/storage/persistenceService.ts) — autosave scheduling, local cache, remote sync, version conflict resolution
- [useWorkflowAgent.ts](file:///Users/g-air/projects/workflow-slide/app/src/hooks/useWorkflowAgent.ts) — agent chat state, message routing, diagram proposal application
- [agentHelpers.ts](file:///Users/g-air/projects/workflow-slide/app/src/utils/agentHelpers.ts) — agent UI helpers (message factory, history slicing, error formatting)
- [edgeAnimation.ts](file:///Users/g-air/projects/workflow-slide/app/src/utils/edgeAnimation.ts) — edge animation planning (all-active / sequential modes)
- [client.ts](file:///Users/g-air/projects/workflow-slide/app/src/api/client.ts) — HTTP client for `/api`
- [contracts.ts](file:///Users/g-air/projects/workflow-slide/app/src/api/contracts.ts) — shared API types (diagrams, revisions, workflow agent)
- [themePresetDefs.json](file:///Users/g-air/projects/workflow-slide/app/shared/themePresetDefs.json) — shared theme preset definitions for frontend and backend
- [index.mjs](file:///Users/g-air/projects/workflow-slide/app/server/index.mjs) — HTTP endpoints: CRUD for diagrams/revisions, workflow agent sessions, GIF export
- [routes.mjs](file:///Users/g-air/projects/workflow-slide/app/server/routes.mjs) — HTTP route definitions
- [workflowExecutionService.mjs](file:///Users/g-air/projects/workflow-slide/app/server/ai/workflowExecutionService.mjs) — orchestrates AI conversation → JSON generation → diagram normalization
- [gifExporter.mjs](file:///Users/g-air/projects/workflow-slide/app/server/render/gifExporter.mjs) — server-side GIF generation with Playwright browser capture

When changing persistence or API behavior, keep frontend contracts, backend responses, and any relevant docs in `dev_docs/` aligned.

## Working Agreements

- Simplicity First, Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
- Prefer small, surgical changes. 
- Remove imports/variables/functions that YOUR changes made unused.
- Preserve the existing style: TypeScript on the frontend, ESM `.mjs` on the backend, semicolons omitted, single quotes, concise helpers.
- Keep React code idiomatic for the current codebase. Follow existing patterns before introducing new abstractions.
- Add or update tests when changing reducer logic, persistence behavior, AI pipeline, or other logic-heavy code.
- If you touch API shapes or schema validation, verify both the client and server sides still agree.
- Treat `dev_docs/` as supporting context, not the only source of truth. Confirm behavior in code before relying on a doc.
- Remember to update the relevant docs in `dev_docs/` after making code changes.
- For Environment realated issues, if you cannot resolve them, stop working and ask for human help.

## Validation Checklist

Choose the smallest relevant verification set for the change:

- frontend logic or UI copy: `npm run test`
- lint-sensitive edits: `npm run lint`
- build or typing risk: `npm run build`

If a change is not covered by automated tests, state that explicitly in the handoff.






