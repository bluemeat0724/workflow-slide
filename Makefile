APP_DIR := app

.PHONY: help install dev dev-local-only dev-remote dev-local-db \
        server server-dev db-migrate db-migrate-sqlite \
        build lint test preview \
        setup start-local-db

help: ## Show available targets
	@echo "Usage: make [target]"
	@echo ""
	@echo "Quick Start:"
	@echo "  install          Install dependencies"
	@echo "  dev              Start full dev (SQLite backend + Vite frontend)"
	@echo "  dev-local-only   Start frontend only (no database)"
	@echo "  dev-remote       Start frontend (remote API mode)"
	@echo "  dev-local-db     Same as dev (SQLite backend + Vite frontend)"
	@echo ""
	@echo "Backend:"
	@echo "  server           Start backend server"
	@echo "  server-dev       Start backend server (watch mode)"
	@echo "  db-migrate       Run PostgreSQL migrations"
	@echo "  db-migrate-sqlite Run SQLite migrations"
	@echo ""
	@echo "Compound:"
	@echo "  setup            Install + run PostgreSQL migrations"
	@echo "  start-local-db   Run SQLite migrations + start local dev server"
	@echo ""
	@echo "Checks:"
	@echo "  build            Type-check and build frontend"
	@echo "  lint             Run ESLint"
	@echo "  test             Run tests"
	@echo "  preview          Preview production build"

install:
	cd $(APP_DIR) && npm install

dev:
	cd $(APP_DIR) && npm run dev

dev-local-only:
	cd $(APP_DIR) && npm run dev:local-only

dev-remote:
	cd $(APP_DIR) && npm run dev:remote

dev-local-db:
	cd $(APP_DIR) && npm run dev:local-db

server:
	cd $(APP_DIR) && npm run server

server-dev:
	cd $(APP_DIR) && npm run server:dev

db-migrate:
	cd $(APP_DIR) && npm run db:migrate

db-migrate-sqlite:
	cd $(APP_DIR) && npm run db:migrate:sqlite

build:
	cd $(APP_DIR) && npm run build

lint:
	cd $(APP_DIR) && npm run lint

test:
	cd $(APP_DIR) && npm run test

preview:
	cd $(APP_DIR) && npm run preview

setup: install db-migrate

start-local-db: db-migrate-sqlite dev-local-db
