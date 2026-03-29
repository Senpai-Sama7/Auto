# Canary And Benchmark Operations

The repository now includes real operational commands:

- `pnpm canary`
- `pnpm benchmark`
- `pnpm release:local`

## Canary coverage

`pnpm canary` verifies, across multiple passes:

- `GET /api/health`
- authenticated `GET /api/state`
- web root response
- Paperclip health
- Hermes health

The command fails fast if any required endpoint is unavailable or returns an unexpected payload.

## Benchmark coverage

`pnpm benchmark` samples:

- API health latency
- authenticated API state latency
- web root latency
- Paperclip health latency
- Hermes health latency

Each report records samples, average, p95, payload size, threshold, and pass/fail status.

## Release use

`pnpm release:local` runs stack startup plus lint, typecheck, build, test, canary, and benchmark, then writes the combined decision to `data/release-decision.json`.
