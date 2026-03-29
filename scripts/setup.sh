#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but was not found on PATH." >&2
  exit 1
fi

mkdir -p data

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

node scripts/bootstrap-upstreams.mjs

pnpm install --no-frozen-lockfile

if [[ -d .cache/upstreams/paperclip ]]; then
  pnpm --dir .cache/upstreams/paperclip install --no-frozen-lockfile
  if [[ ! -f .cache/upstreams/paperclip/packages/plugins/sdk/dist/index.js ]]; then
    pnpm --dir .cache/upstreams/paperclip --filter @paperclipai/server... build
  fi
fi

if [[ -d .cache/upstreams/hermes-agent ]]; then
  if ! command -v uv >/dev/null 2>&1; then
    echo "uv is required to install Hermes Agent." >&2
    exit 1
  fi
  uv venv .cache/upstreams/hermes-agent/.venv --python 3.11
  uv pip install --python .cache/upstreams/hermes-agent/.venv/bin/python -e "${ROOT_DIR}/.cache/upstreams/hermes-agent[messaging,acp]"
fi

if [[ -d .cache/upstreams/openclaw ]]; then
  pnpm --dir .cache/upstreams/openclaw install --no-frozen-lockfile
  if [[ ! -f .cache/upstreams/openclaw/dist/entry.js && ! -f .cache/upstreams/openclaw/dist/entry.mjs ]]; then
    pnpm --dir .cache/upstreams/openclaw build
  fi
fi
