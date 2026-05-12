# references/mjs — CI Makefile
#
# Thin wrapper around npm + node --test + eslint for local + CI parity.
# Every target is idempotent and safe to re-run. `make ci` is the single
# command CI runs.

SHELL          := /bin/bash
.SHELLFLAGS    := -eu -o pipefail -c
.DEFAULT_GOAL  := help

PKG_DIR        := $(abspath $(CURDIR))
NPM            ?= npm
NODE           ?= node
NPX            ?= npx

# ---------------------------------------------------------------------------
# meta
# ---------------------------------------------------------------------------

.PHONY: help
help: ## Show available targets
	@awk 'BEGIN{FS=":.*##"; printf "\nTargets:\n"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: print-env
print-env: ## Print tool versions (debug)
	@echo "pkg-dir : $(PKG_DIR)"
	@$(NODE) --version
	@$(NPM)  --version

# ---------------------------------------------------------------------------
# lifecycle
# ---------------------------------------------------------------------------

.PHONY: install
install: ## Install dependencies (mutable lockfile OK)
	@$(NPM) install

.PHONY: ci-install
ci-install: ## Deterministic install for CI (frozen lockfile)
	@if [ -f package-lock.json ]; then $(NPM) ci; else $(NPM) install; fi

.PHONY: lint
lint: ## Static checks
	@if [ -x ./node_modules/.bin/eslint ]; then $(NPX) --no-install eslint src; else echo "eslint not installed; skipping"; fi

.PHONY: test
test: ## Run the package test suite (node --test)
	@$(NODE) --test 'test/*.test.mjs'

.PHONY: build
build: ## Produce dist/ (raw ESM copy — no transpile)
	@rm -rf dist
	@mkdir -p dist
	@cp -R src package.json dist/

.PHONY: clean
clean: ## Remove generated artifacts
	@rm -rf dist

.PHONY: distclean
distclean: clean ## Also remove installed dependencies
	@rm -rf node_modules

# ---------------------------------------------------------------------------
# CI aggregate
# ---------------------------------------------------------------------------

.PHONY: ci
ci: ci-install lint test build ## Full CI pipeline (install → lint → test → build)
