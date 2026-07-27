# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Serverless service (AWS Lambda, Serverless Framework v4) that takes a person's name, uses an LLM agent to find their LinkedIn profile, scrapes it via Proxycurl, and generates a short summary + two facts, delivered async via webhook.

Flow: `POST /ice-breaker` (HTTP Lambda) → validates `x-api-key` → creates task in Upstash Redis → enqueues SQS message → returns `202` with `taskId`. An SQS worker Lambda then runs the LLM pipeline (find LinkedIn URL via tool-calling agent → scrape via Proxycurl → summarize via structured-output `generateText`) and POSTs the result to the caller's `webhookUrl`.

## Commands

```sh
npm run build          # tsc --noEmit — type-check only, esbuild (via Serverless) does the real bundling
npm run lint           # eslint src/
npm test               # vitest run
npm run test:watch     # vitest watch mode
npm run test:coverage  # vitest run --coverage
npm run deploy:dev     # sls deploy --stage dev
npm run deploy:prod    # sls deploy --stage prod
npm run package        # sls package (validate CloudFormation without deploying)
npm run e2e            # ts-node scripts/e2e.ts — needs BASE_URL, API_KEY, NAME (+ optional WEBHOOK_URL) against a deployed stack
```

Run a single test file: `npx vitest run src/features/dispatch-task.feature.test.ts`

## Structure

```
src/
  features/                       # domain + use-cases + tests, all flat, no subfolders
    domain.ts                     # Task, TaskStatus, TaskResult, CreateTaskInput, UpdateTaskInput
    search-gateway.ts             # SearchGateway port (findLinkedInUrl)
    dispatch-task.feature.ts      # HTTP-side use-case: create task in store, send SQS message
    process-task.feature.ts       # Worker-side use-case: run ResearchProfile, update task store, POST webhook
    research-profile.feature.ts   # LLM pipeline: tool-calling agent finds LinkedIn URL, Proxycurl scrapes, structured-output summarizes
    *.feature.test.ts             # one test file per feature above
  adapters/
    store/task-store.ts           # TaskStore — Upstash Redis-backed task store, 24h TTL, key `ice-breaker:task:{taskId}`
    search/
      search.factory.ts           # createSearchAdapter(config) — picks serpapi/google by config.SEARCH_PROVIDER
      serpapi.adapter.ts
      google.adapter.ts
    linkedin/proxycurl.adapter.ts # scrapes + filters profile (strips empty fields, PII-ish noise keys, pic URLs from groups)
  handlers/
    container.ts                  # manual DI: builds all adapters + features once at module load, exports singleton `container`
    http-handler.ts                # API Gateway HTTP API v2 handler — validates api key + body, calls container.dispatchTask
    worker-handler.ts              # SQS handler (batchSize 1) — calls container.processTask per record, returns batchItemFailures
  shared/
    config.ts                     # Zod-validated env config, parsed once as a singleton at import time — throws on invalid env
    auth.ts                       # validateApiKey(event, expectedKey) — checks x-api-key header
    logger.ts                     # pino logger singleton, JSON structured, base fields {service, stage}
scripts/
  setup-ssm.sh                    # loads .env, pushes params to SSM under /ice-breaker/{stage}/*
  e2e.ts                          # smoke test against a deployed stack
```

Layering is ports & adapters: `features/` (domain + use-cases) → `adapters/` (external services) → `handlers/` (Lambda entrypoints + composition root).

## Key architectural details

- **Composition root**: `handlers/container.ts` builds every adapter and use-case exactly once at module load and exports a `container` singleton. Both handlers import from it — there is no per-invocation construction and no DI framework.
- **Config is a fail-fast singleton**: `shared/config.ts` parses `process.env` through a Zod schema at import time. A missing required var throws immediately on cold start, not on first use.
- **SearchGateway is the swappable port**: `research-profile.feature.ts` depends only on the `SearchGateway` interface (`search-gateway.ts`). `adapters/search/search.factory.ts` is the only place that knows about `SEARCH_PROVIDER` and chooses between SerpAPI/Google at container-build time.
- **ResearchProfile pipeline** (`features/research-profile.feature.ts`): runs two separate `generateText` calls — first an agentic step with a `searchLinkedIn` tool (bounded by `stopWhen: [isStepCount(3)]`) to resolve the LinkedIn URL, then a second call using `output: Output.object({ schema: summarySchema })` (from the `ai` SDK) to get the validated `{summary, facts}` object directly — no manual JSON regex-extraction/parsing.
- **Task state machine**: `PENDING → PROCESSING → DONE|FAILED`, persisted in `TaskStore` (Upstash Redis) with a 24h TTL, keyed `ice-breaker:task:{taskId}`. `ProcessTask` transitions to `PROCESSING` before running the pipeline, and to `DONE`/`FAILED` after — a `FAILED` update failure is caught and logged (not re-thrown) so the original error still propagates to SQS for retry.
- **SQS retry contract**: worker uses `functionResponseType: ReportBatchItemFailures` with `batchSize: 1`; a thrown error or unparseable message body adds the record's `messageId` to `batchItemFailures`, letting SQS redeliver up to `maxReceiveCount: 3` before DLQ. `VisibilityTimeout` (180s) is deliberately ≥ 2× the worker's Lambda timeout (60s) to avoid duplicate concurrent processing.
- **Secrets flow**: local `.env` → `scripts/setup-ssm.sh` → SSM Parameter Store (`/ice-breaker/{stage}/*`) → resolved by Serverless Framework at deploy time → injected as Lambda env vars. The app itself only ever reads `process.env`; it never calls SSM at runtime.
- **Serverless v4 built-in esbuild**: bundling config lives under the top-level `build:` key in `serverless.yml` — no `serverless-esbuild` plugin, `plugins: []` is empty.

## Testing conventions

- Only `src/features/*.feature.test.ts` are collected (see `vitest.config.ts`); adapters, handlers, and shared modules have no direct unit tests.
- Mock with `vi.fn()` / `vi.mock()`; reset with `vi.clearAllMocks()` in `beforeEach` (not `resetAllMocks`) — see any `*.feature.test.ts` for the pattern.
- Modules with side-effecting top-level singletons (e.g. `crypto.randomUUID` in `dispatch-task.feature.ts`) are mocked via `vi.mock()` before import.
