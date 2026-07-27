#!/usr/bin/env npx ts-node
/**
 * e2e.ts — End-to-end smoke test for the Ice Breaker service.
 *
 * Starts a local webhook listener, fires a POST /ice-breaker request,
 * and waits for the webhook callback with the result.
 *
 * Usage:
 *   BASE_URL=https://xxx.execute-api.us-east-1.amazonaws.com \
 *   API_KEY=your-key \
 *   NAME="Elon Musk" \
 *   npx ts-node scripts/e2e.ts
 *
 * Optional:
 *   WEBHOOK_PORT=4000   (default: 3999)
 *   WEBHOOK_URL=https://smee.io/xxx   (use external tunnel instead of localhost)
 *   TIMEOUT_MS=60000    (default: 60000)
 */

import * as http from "http";

// ── Config from env ──────────────────────────────────────────────────────────

const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:3000";
const API_KEY = process.env["API_KEY"] ?? "";
const NAME = process.env["NAME"] ?? "Satoshi Nakamoto";
const WEBHOOK_PORT = parseInt(process.env["WEBHOOK_PORT"] ?? "3999", 10);
const WEBHOOK_URL =
  process.env["WEBHOOK_URL"] ?? `http://localhost:${WEBHOOK_PORT}/webhook`;
const TIMEOUT_MS = parseInt(process.env["TIMEOUT_MS"] ?? "60000", 10);

// ── Types ────────────────────────────────────────────────────────────────────

interface IceBreakerResult {
  summary: string;
  facts: string[];
}

interface WebhookPayload {
  taskId: string;
  status: "DONE" | "FAILED";
  result?: IceBreakerResult;
  error?: string;
}

interface EnqueueResponse {
  taskId: string;
  status: string;
  message: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string, data?: unknown): void {
  const ts = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${ts}] ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${ts}] ${msg}`);
  }
}

function collectBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// ── Webhook server ───────────────────────────────────────────────────────────

function startWebhookServer(): {
  server: http.Server;
  waitForResult: () => Promise<WebhookPayload>;
} {
  let resolveResult!: (payload: WebhookPayload) => void;
  let rejectResult!: (err: Error) => void;

  const resultPromise = new Promise<WebhookPayload>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/webhook") {
      try {
        const body = await collectBody(req);
        const payload = JSON.parse(body) as WebhookPayload;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        resolveResult(payload);
      } catch (err) {
        res.writeHead(400);
        res.end();
        rejectResult(err instanceof Error ? err : new Error(String(err)));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  return {
    server,
    waitForResult: () => resultPromise,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("=== Ice Breaker E2E Smoke Test ===");
  log(`Target : ${BASE_URL}`);
  log(`Name   : ${NAME}`);
  log(`Webhook: ${WEBHOOK_URL}`);
  log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log("");

  // ── 1. Start local webhook server ──
  const { server, waitForResult } = startWebhookServer();

  await new Promise<void>((resolve) =>
    server.listen(WEBHOOK_PORT, () => {
      log(`Webhook listener started on port ${WEBHOOK_PORT}`);
      resolve();
    })
  );

  // ── 2. Enqueue the task ──
  log(`POST ${BASE_URL}/ice-breaker`);

  const enqueueRes = await fetch(`${BASE_URL}/ice-breaker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({ name: NAME, webhookUrl: WEBHOOK_URL }),
  });

  if (!enqueueRes.ok) {
    const text = await enqueueRes.text();
    throw new Error(
      `Enqueue failed: ${enqueueRes.status} ${enqueueRes.statusText}\n${text}`
    );
  }

  const enqueueBody = (await enqueueRes.json()) as EnqueueResponse;
  log(`Task enqueued`, enqueueBody);

  // ── 3. Wait for webhook callback ──
  log(`Waiting up to ${TIMEOUT_MS / 1000}s for webhook callback...`);

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Timeout: no webhook received after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS
    )
  );

  const payload = await Promise.race([waitForResult(), timeoutPromise]);

  // ── 4. Validate result ──
  log(`Webhook received`, payload);

  if (payload.status !== "DONE") {
    throw new Error(`Task failed: ${payload.error ?? "unknown error"}`);
  }

  if (!payload.result?.summary) {
    throw new Error("Result missing summary field");
  }

  if (!Array.isArray(payload.result.facts) || payload.result.facts.length !== 2) {
    throw new Error("Result must contain exactly 2 facts");
  }

  // ── 5. Print result ──
  console.log("");
  console.log("══════════════════════════════════════════");
  console.log(`  ICE BREAKER: ${NAME}`);
  console.log("══════════════════════════════════════════");
  console.log("");
  console.log("SUMMARY");
  console.log("-------");
  console.log(payload.result.summary);
  console.log("");
  console.log("INTERESTING FACTS");
  console.log("-----------------");
  payload.result.facts.forEach((fact, i) => console.log(`${i + 1}. ${fact}`));
  console.log("");
  console.log("✅ Smoke test PASSED");
}

// ── Run ───────────────────────────────────────────────────────────────────────

main()
  .catch((err) => {
    console.error("\n❌ Smoke test FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => {
    // Ensure process exits even if server keeps event loop alive
    setTimeout(() => process.exit(0), 200);
  });
