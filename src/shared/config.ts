import { z } from "zod";

const configSchema = z.object({
  // LLM
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  LLM_MODEL: z.string().default("gpt-4o"),

  // LinkedIn scraping
  PROXYCURL_API_KEY: z.string().min(1, "PROXYCURL_API_KEY is required"),

  // Search provider
  SEARCH_PROVIDER: z.enum(["serpapi", "google"]).default("serpapi"),
  SERPAPI_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_CSE_ID: z.string().optional(),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),

  // API authentication
  API_KEY: z.string().min(1, "API_KEY is required"),

  // SQS
  SQS_QUEUE_URL: z.string().url("SQS_QUEUE_URL must be a valid URL"),

  // App
  STAGE: z.string().default("dev"),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${errors}`);
  }

  return result.data;
}

// Singleton — parsed once at module load
export const config: Config = loadConfig();
