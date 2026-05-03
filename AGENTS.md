# AGENTS.md

## Purpose

This repository contains a workflow editor prototype. The main app lives in `app/` and combines:

- a React 19 + TypeScript + Vite frontend
- a small Node.js HTTP API in `app/server/`
- PostgreSQL-backed persistence for remote diagram storage and revision history

The top-level `README.md` is minimal, so use this file as the working guide for code agents.

## Repository Layout

- `app/src/`: frontend application code
- `app/src/components/`: editor UI such as canvas, toolbar, inspector, sidebar, and remote library views
- `app/src/editor/`: reducer-driven editor state and tests
- `app/src/api/`: frontend API client and shared contract types
- `app/src/storage/`: persistence service coordinating local cache, autosave, remote sync, and conflict handling
- `app/src/model/`: diagram domain model types
- `app/src/data/`: fixtures and theme presets
- `app/server/`: backend entrypoint, config, DB access, schema validation, and migrations
- `dev_docs/`: design notes, plans, and API/storage documentation

Do not spend time editing generated or dependency directories such as `app/node_modules/` or `app/dist/`.

## Setup And Commands

Run all app commands from `app/`.

- `npm install`: install dependencies
- `npm run dev`: start the Vite frontend
- `npm run server`: start the backend with `.env`
- `npm run server:dev`: start the backend in watch mode
- `npm run db:migrate`: apply database migrations
- `npm run test`: run Vitest
- `npm run lint`: run ESLint
- `npm run build`: type-check and build the frontend

Backend environment variables are documented in `app/.env.example`.

## Architecture Notes

The frontend is reducer-centric. `app/src/App.tsx` wires together UI components, the editor reducer, API access, persistence, import/export, and localized status messaging.

Key data flow:

- `app/src/model/diagram.ts` defines the core diagram shape
- `app/src/editor/editorState.ts` owns state transitions
- `app/src/storage/persistenceService.ts` manages autosave, local cache, remote fetch/save, and version conflicts
- `app/src/api/client.ts` talks to `/api`
- `app/src/api/contracts.ts` is the shared contract surface the frontend expects
- `app/server/index.mjs` implements the HTTP endpoints and persistence behavior

When changing persistence or API behavior, keep frontend contracts, backend responses, and any relevant docs in `dev_docs/` aligned.

## Working Agreements

- Prefer small, surgical changes. The worktree may already contain user changes.
- Check `git status` before editing and avoid reverting unrelated modifications.
- Preserve the existing style: TypeScript on the frontend, ESM `.mjs` on the backend, semicolons omitted, single quotes, concise helpers.
- Keep React code idiomatic for the current codebase. Follow existing patterns before introducing new abstractions.
- Add or update tests when changing reducer logic, persistence behavior, or other logic-heavy code.
- If you touch API shapes or schema validation, verify both the client and server sides still agree.
- Treat `dev_docs/` as supporting context, not the only source of truth. Confirm behavior in code before relying on a doc.

## Validation Checklist

Choose the smallest relevant verification set for the change:

- frontend logic or UI copy: `npm run test`
- lint-sensitive edits: `npm run lint`
- build or typing risk: `npm run build`
- backend or persistence changes: run the relevant server command and confirm environment assumptions from `app/.env.example`

If a change is not covered by automated tests, state that explicitly in the handoff.
