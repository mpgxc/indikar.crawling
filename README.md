# Ice Breaker — LinkedIn Profile Summarizer

Serverless service that receives a person's name, finds their LinkedIn profile via an LLM agent, scrapes it, and generates a short professional summary + two interesting facts — delivered asynchronously via webhook.

## Architecture

```
POST /ice-breaker
      │
      ▼
HTTP Lambda ──── validates x-api-key
      │           creates task (Upstash Redis)
      │           publishes to SQS
      │
      ▼
 202 + taskId
      
SQS Queue ──────► Worker Lambda
                      │
                      ├─ 1. LLM Agent (Vercel AI SDK + GPT-4o)
                      │      └─ tool: searchLinkedIn → SerpAPI / Google
                      │
                      ├─ 2. Proxycurl API (LinkedIn scraping)
                      │
                      ├─ 3. LLM summarization → { summary, facts[] }
                      │
                      ├─ updates task status (Upstash Redis, TTL 24h)
                      │
                      └─ POST result → webhookUrl
```

## Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js 22 + TypeScript 5.8 |
| Infrastructure | Serverless Framework v4 + AWS Lambda |
| LLM inference | Vercel AI SDK (`ai` + `@ai-sdk/openai`) |
| LLM model | GPT-4o (configurable via `LLM_MODEL` env var) |
| LinkedIn search | SerpAPI or Google Custom Search (Port + Adapters) |
| LinkedIn scraping | Proxycurl API |
| Job persistence | Upstash Redis (HTTP-based, TTL 24h) |
| Queue | AWS SQS + DLQ (maxReceiveCount: 3) |
| Auth | `x-api-key` header |
| Observability | pino structured logs → CloudWatch |
| Bundling | esbuild (built-in SFv4) |

## Project Structure

```
src/
  handlers/
    http-handler.ts        # POST /ice-breaker endpoint
    worker-handler.ts      # SQS consumer
    container.ts           # composition root — builds adapters + use-cases once
  features/
    domain.ts               # Task, TaskStatus, TaskResult types
    search-gateway.ts       # SearchGateway port
    dispatch-task.feature.ts    # create task + enqueue SQS message
    process-task.feature.ts     # run pipeline, update task, POST webhook
    research-profile.feature.ts # LLM pipeline: find URL, scrape, summarize
  adapters/
    search/
      serpapi.adapter.ts
      google.adapter.ts
      search.factory.ts    # Selects adapter via SEARCH_PROVIDER
    linkedin/
      proxycurl.adapter.ts
    store/
      task-store.ts        # Upstash Redis-backed task store
  shared/
    config.ts              # Zod-validated env vars
    logger.ts               # pino logger
    auth.ts                # x-api-key validation
scripts/
  setup-ssm.sh             # Bootstrap SSM parameters
  e2e.ts                   # End-to-end smoke test
```

## Prerequisites

- Node.js 22+
- AWS CLI configured (`aws configure`)
- Accounts/keys for: OpenAI, Proxycurl, SerpAPI (or Google Custom Search), Upstash Redis

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your actual keys
```

### 3. Bootstrap SSM parameters (one-time per stage)

```bash
# Load from .env and push to SSM
STAGE=dev source .env && ./scripts/setup-ssm.sh
```

This creates all parameters under `/ice-breaker/dev/*` in AWS SSM Parameter Store. Secrets are stored as `SecureString`.

### 4. Deploy

```bash
# Deploy to dev
npm run deploy:dev

# Deploy to prod
npm run deploy:prod
```

### 5. Verify deployment

```bash
npx sls info --stage dev
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key |
| `LLM_MODEL` | — | `gpt-4o` | LLM model name |
| `PROXYCURL_API_KEY` | ✅ | — | Proxycurl API key for LinkedIn scraping |
| `SEARCH_PROVIDER` | — | `serpapi` | Search provider: `serpapi` or `google` |
| `SERPAPI_KEY` | if serpapi | — | SerpAPI key |
| `GOOGLE_API_KEY` | if google | — | Google API key |
| `GOOGLE_CSE_ID` | if google | — | Google Custom Search Engine ID |
| `UPSTASH_REDIS_REST_URL` | ✅ | — | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | — | Upstash Redis REST token |
| `API_KEY` | ✅ | — | Secret key for `x-api-key` header auth |

## API

### POST /ice-breaker

Enqueues an ice-breaker generation job.

**Headers:**
```
x-api-key: <API_KEY>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Elon Musk",
  "webhookUrl": "https://your-app.com/webhook/callback"
}
```

**Response `202 Accepted`:**
```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "message": "Task accepted. Result will be posted to webhookUrl."
}
```

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Missing or invalid fields |
| `401` | Missing or invalid `x-api-key` |
| `500` | Internal error (Redis or SQS unavailable) |

### Webhook callback

When processing completes, a `POST` is made to your `webhookUrl`:

**Success payload:**
```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "DONE",
  "result": {
    "summary": "Experienced entrepreneur and engineer with a track record of disrupting multiple industries.",
    "facts": [
      "Founded or co-founded 6 companies including SpaceX and Tesla",
      "Learned to code at age 12 and sold his first game for $500"
    ]
  }
}
```

**Failure payload:**
```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "FAILED",
  "error": "Proxycurl request failed: 429 Too Many Requests"
}
```

## Development

### Run tests

```bash
npm test
npm run test:coverage
```

### Type check

```bash
npm run build
```

### Package (validate CloudFormation without deploying)

```bash
npx sls package --stage dev
```

## End-to-end Smoke Test

Requires a deployed service and real API keys in your environment:

```bash
# Using local webhook receiver
BASE_URL=https://xxx.execute-api.us-east-1.amazonaws.com \
API_KEY=your-secret-key \
NAME="Satoshi Nakamoto" \
npx ts-node scripts/e2e.ts

# Using an external tunnel (ngrok, smee.io) for webhook
BASE_URL=https://xxx.execute-api.us-east-1.amazonaws.com \
API_KEY=your-secret-key \
NAME="Satoshi Nakamoto" \
WEBHOOK_URL=https://smee.io/your-channel \
npx ts-node scripts/e2e.ts
```

## Observability

All Lambda logs are structured JSON via pino and flow to CloudWatch Log Groups:
- `/aws/lambda/ice-breaker-iceBreakerHttp-dev`
- `/aws/lambda/ice-breaker-iceBreakerWorker-dev`

Two CloudWatch Alarms are created automatically:
- `ice-breaker-dlq-messages-{stage}` — fires when any message reaches the DLQ
- `ice-breaker-worker-errors-{stage}` — fires when worker Lambda errors exceed 3 in 5 minutes

## Retry & Error Handling

| Scenario | Behavior |
|---|---|
| Worker throws | Job → `FAILED` in Redis, SQS retries up to 3× |
| 3 consecutive failures | Message routed to DLQ (14-day retention) |
| Webhook delivery fails | Treated as job failure, SQS retries |
| Malformed SQS message | Immediately routed to DLQ (not retried) |
| Redis unavailable on HTTP | Returns 500, job not created |
| Redis unavailable on Worker | Best-effort FAILED update, SQS retries |
