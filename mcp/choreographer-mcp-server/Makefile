# Choreographer MCP Server Makefile

.PHONY: help install install-dev test test-coverage lint format clean build

PYTHON := python3
PIP := pip3

help:
	@echo "Choreographer MCP Server"
	@echo ""
	@echo "Available targets:"
	@echo "  install      - Install package"
	@echo "  install-dev  - Install with dev dependencies"
	@echo "  test         - Run tests"
	@echo "  test-coverage- Run tests with coverage"
	@echo "  test-crdt    - Run CRDT property tests"
	@echo "  test-sandbox - Run sandbox isolation tests"
	@echo "  lint         - Run linter (ruff)"
	@echo "  format       - Format code (ruff)"
	@echo "  type-check   - Run type checker (mypy)"
	@echo "  clean        - Clean build artifacts"
	@echo "  build        - Build package"
	@echo "  server       - Run MCP server"
	@echo "  check-all    - Run all checks"

install:
	$(PIP) install -e .

install-dev:
	$(PIP) install -e ".[dev]"

test:
	pytest -v

test-coverage:
	pytest --cov=choreographer_mcp_server --cov-report=html --cov-report=term

test-crdt:
	pytest tests/test_crdt_properties.py -v

test-sandbox:
	pytest tests/test_sandbox.py -v

lint:
	ruff check src tests

format:
	ruff format src tests

type-check:
	mypy src/choreographer_mcp_server

clean:
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info/
	rm -rf .pytest_cache/
	rm -rf .mypy_cache/
	rm -rf htmlcov/
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

build: clean
	$(PYTHON) -m build

server:
	$(PYTHON) -m choreographer_mcp_server.server

check-all: lint type-check test
	@echo "All checks passed!"
