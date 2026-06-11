APP_DIR := app

.PHONY: help install dev frontend server server-dev migrate build lint test preview

help: ## Show available targets
	@echo "Usage: make [target]"
	@echo ""
	@echo "Quick Start:"
	@echo "  install          Install dependencies"
	@echo "  dev              Start backend + Vite using root .env"
	@echo "  frontend         Start Vite using root .env"
	@echo ""
	@echo "Backend:"
	@echo "  server           Start backend server"
	@echo "  server-dev       Start backend server (watch mode)"
	@echo "  migrate          Run migrations selected by STORAGE_DRIVER"
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

frontend:
	cd $(APP_DIR) && npm run frontend

server:
	cd $(APP_DIR) && npm run server

server-dev:
	cd $(APP_DIR) && npm run server:dev

migrate:
	cd $(APP_DIR) && npm run db:migrate

build:
	cd $(APP_DIR) && npm run build

lint:
	cd $(APP_DIR) && npm run lint

test:
	cd $(APP_DIR) && npm run test

preview:
	cd $(APP_DIR) && npm run preview
