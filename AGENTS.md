# AGENTS.md — ice-breaker-ts

## Architecture

- **Hexagonal (ports & adapters)**: `src/features/` (domain + use-cases) → `src/adapters/` (external services) → `src/handlers/` (Lambda entrypoints + composition root)
- **Two entrypoints** in `src/handlers/`:
  - `http-handler.ts` — API Gateway HTTP API v2, POST `/ice-breaker`, validates `x-api-key`, persists task to Upstash Redis, enqueues to SQS
  - `worker-handler.ts` — SQS consumer (batchSize:1), runs LLM pipeline, POSTs result to webhook URL
- `container.ts` is the composition root — builds every adapter/use-case once at module load, exported as a `container` singleton both handlers import from
- **Pipeline**: find LinkedIn URL (LLM agent + search API) → scrape profile (Proxycurl) → generate summary (`generateText` with `output: Output.object({schema})`)
- **Task state** in Upstash Redis with 24h TTL (`ice-breaker:task:{taskId}`), via `TaskStore` (`src/adapters/store/task-store.ts`)

## Commands

```sh
npm run build          # tsc --noEmit (type-check only; Serverless esbuild handles real build)
npm run lint           # eslint src/
npm test               # vitest run
npm run test:watch     # vitest (watch mode)
npm run test:coverage  # vitest run --coverage
npm run deploy:dev     # sls deploy --stage dev
npm run deploy:prod    # sls deploy --stage prod
npm run package        # sls package
npm run e2e            # npx ts-node scripts/e2e.ts (requires BASE_URL + API_KEY + NAME in env)
```

## Testing conventions

- Tests use `vi.fn()` / `vi.mock()` from vitest.
- Feature tests only — adapters, handlers, and shared modules are not tested directly.
- Tests use `vi.clearAllMocks()` in `beforeEach` (not `resetAllMocks`).
- Test files live beside source (`*.test.ts`), collected from `src/features/`.

## Config & secrets

- All config from env vars, validated at module load via Zod schema (`src/shared/config.ts`).
- Copy `.env.example` → `.env` for local testing (loaded by `setup-ssm.sh`, not by the app itself — the app reads `process.env` directly).
- Deployed secrets stored in SSM Parameter Store (`/ice-breaker/{stage}/`), resolved by Serverless Framework at deploy time and injected as env vars.
- `scripts/setup-ssm.sh` populates SSM from `.env` (SecureString for keys, String for config).

## Serverless v4 quirks

- Uses Serverless Framework v4 **built-in esbuild** (configured via top-level `build` key) — no `serverless-esbuild` plugin needed.
- `@aws-sdk/client-sqs` is externalized from the bundle.
- Lambda timeouts: HTTP handler 29s, Worker 60s. SQS VisibilityTimeout: 180s.
- Queue uses `ReportBatchItemFailures` — return `{ batchItemFailures: [{ itemIdentifier }] }` for failed messages.

## Deploy prerequisites

1. `STAGE=dev ./scripts/setup-ssm.sh` (requires AWS credentials + `.env` with all secrets)
2. `npm run deploy:dev` or `npm run deploy:prod`
