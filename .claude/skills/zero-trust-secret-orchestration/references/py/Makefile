# references/py — CI Makefile
#
# Thin wrapper around uv + ruff + pytest for local + CI parity.
# Falls back to plain pip + venv if `uv` is absent so CI runs on a bare
# image. `make ci` is the single command CI runs.

SHELL          := /bin/bash
.SHELLFLAGS    := -eu -o pipefail -c
.DEFAULT_GOAL  := help

PKG_DIR        := $(abspath $(CURDIR))
UV             := $(shell command -v uv 2> /dev/null)
PYTHON         ?= python3

# Prefer `uv run …` when `uv` is on PATH; otherwise fall back to the venv.
ifeq ($(UV),)
RUN := . .venv/bin/activate &&
INSTALL := $(PYTHON) -m venv .venv && $(RUN) pip install -e '.[dev]'
CI_INSTALL := $(PYTHON) -m venv .venv && $(RUN) pip install --no-deps -e .
else
RUN := uv run
INSTALL := uv sync
CI_INSTALL := uv sync --frozen
endif

# ---------------------------------------------------------------------------
# meta
# ---------------------------------------------------------------------------

.PHONY: help
help: ## Show available targets
	@awk 'BEGIN{FS=":.*##"; printf "\nTargets:\n"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: print-env
print-env: ## Print tool versions (debug)
	@echo "pkg-dir : $(PKG_DIR)"
	@echo "uv      : $(if $(UV),$(UV),<absent — falling back to pip+venv>)"
	@$(PYTHON) --version

# ---------------------------------------------------------------------------
# lifecycle
# ---------------------------------------------------------------------------

.PHONY: install
install: ## Install dependencies (mutable lockfile OK)
	@$(INSTALL)

.PHONY: ci-install
ci-install: ## Deterministic install for CI (frozen lockfile)
	@$(CI_INSTALL)

.PHONY: lint
lint: ## Static checks
	@$(RUN) ruff check src tests

.PHONY: test
test: ## Run the package test suite (pytest)
	@$(RUN) pytest -q

.PHONY: build
build: ## Produce the sdist + wheel under dist/
	@rm -rf dist
	@$(RUN) python -m build --sdist --wheel

.PHONY: clean
clean: ## Remove generated artifacts
	@rm -rf dist .pytest_cache
	@find . -name __pycache__ -prune -exec rm -rf {} +

.PHONY: distclean
distclean: clean ## Also remove the virtualenv
	@rm -rf .venv

# ---------------------------------------------------------------------------
# CI aggregate
# ---------------------------------------------------------------------------

.PHONY: ci
ci: ci-install lint test build ## Full CI pipeline (install → lint → test → build)
