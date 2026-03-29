#!/usr/bin/env bash
set -euo pipefail

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo "This script is meant to be sourced, not executed directly." >&2
  exit 1
fi

resolve_hermes_provider() {
  if [[ -n "${HERMES_INFERENCE_PROVIDER:-}" ]]; then
    printf '%s\n' "$HERMES_INFERENCE_PROVIDER"
    return 0
  fi

  if [[ -f "${HOME}/.codex/auth.json" ]]; then
    printf 'openai-codex\n'
    return 0
  fi

  if [[ -n "${OPENAI_BASE_URL:-}" ]] || [[ -n "${OPENAI_API_KEY:-}" ]]; then
    printf 'custom\n'
    return 0
  fi

  if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    printf 'anthropic\n'
    return 0
  fi

  echo "No usable Hermes inference provider credentials were found." >&2
  echo "Set HERMES_INFERENCE_PROVIDER explicitly or provide ANTHROPIC_API_KEY, ~/.codex/auth.json, or OPENAI_API_KEY." >&2
  return 1
}

resolve_hermes_model() {
  local provider="${1:-}"

  if [[ -n "${HERMES_MODEL:-}" ]]; then
    printf '%s\n' "$HERMES_MODEL"
    return 0
  fi

  case "$provider" in
    anthropic)
      printf 'claude-sonnet-4-20250514\n'
      ;;
    custom)
      printf 'gpt-4o-mini\n'
      ;;
    openrouter)
      printf 'anthropic/claude-sonnet-4\n'
      ;;
    nous)
      printf 'nous-hermes-3\n'
      ;;
    openai-codex|copilot|copilot-acp|*)
      printf 'gpt-5.4\n'
      ;;
  esac
}

resolve_hermes_base_url() {
  local provider="${1:-}"
  if [[ "$provider" == "custom" ]]; then
    printf '%s\n' "${OPENAI_BASE_URL:-https://api.openai.com/v1}"
    return 0
  fi
  printf '%s\n' ""
}

HERMES_RESOLVED_PROVIDER="$(resolve_hermes_provider)"
HERMES_RESOLVED_MODEL="$(resolve_hermes_model "$HERMES_RESOLVED_PROVIDER")"
HERMES_RESOLVED_BASE_URL="$(resolve_hermes_base_url "$HERMES_RESOLVED_PROVIDER")"

export HERMES_RESOLVED_PROVIDER
export HERMES_RESOLVED_MODEL
export HERMES_RESOLVED_BASE_URL
