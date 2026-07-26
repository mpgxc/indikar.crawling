import { generateText, isStepCount } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import type { SearchGateway } from "./search-gateway";
import type { ProxycurlAdapter } from "../adapters/linkedin/proxycurl.adapter";
import type { TaskResult } from "./domain";
import { logger } from "../shared/logger";

export interface ResearchProfileInput {
  name: string;
}

export type ResearchProfileOutput = TaskResult;

const summarySchema = z.object({
  summary: z.string().describe("A short professional summary of the person"),
  facts: z
    .array(z.string())
    .length(2)
    .describe("Two interesting facts about the person"),
});

export interface ResearchProfileDeps {
  searchAdapter: SearchGateway;
  proxycurlAdapter: ProxycurlAdapter;
  model: string;
  openaiApiKey: string;
}

export class ResearchProfile {
  private readonly searchAdapter: SearchGateway;
  private readonly proxycurlAdapter: ProxycurlAdapter;
  private readonly modelId: string;
  private readonly openai: ReturnType<typeof createOpenAI>;

  constructor(deps: ResearchProfileDeps) {
    this.searchAdapter = deps.searchAdapter;
    this.proxycurlAdapter = deps.proxycurlAdapter;
    this.modelId = deps.model;
    this.openai = createOpenAI({ apiKey: deps.openaiApiKey });
  }

  async execute(input: ResearchProfileInput): Promise<ResearchProfileOutput> {
    const { name } = input;
    const childLogger = logger.child({ feature: "research-profile", name });

    childLogger.info("Starting LinkedIn URL lookup via LLM agent");

    const { text: linkedInUrl } = await generateText({
      model: this.openai(this.modelId),
      tools: {
        searchLinkedIn: {
          description:
            "Search the web to find the LinkedIn profile URL for a given person's full name. Returns the LinkedIn profile URL.",
          inputSchema: z.object({
            name: z
              .string()
              .describe("The full name of the person to search for"),
          }),
          execute: async ({ name: searchName }) => {
            const url = await this.searchAdapter.findLinkedInUrl(searchName);
            return { linkedInUrl: url };
          },
        },
      },
      stopWhen: [isStepCount(3)],
      system:
        "You are a research assistant. Your only job is to find a person's LinkedIn profile URL. " +
        "Use the searchLinkedIn tool and return ONLY the URL \u2014 no explanation, no markdown.",
      prompt: `Find the LinkedIn profile URL for: ${name}`,
    });

    const profileUrl = linkedInUrl.trim();
    childLogger.info({ profileUrl }, "LinkedIn URL resolved");

    childLogger.info({ profileUrl }, "Scraping LinkedIn profile");
    const profileData = await this.proxycurlAdapter.scrapeProfile(profileUrl);

    childLogger.info("Generating ice-breaker summary");

    const { object } = await generateText({
      model: this.openai(this.modelId),
      system:
        "You are a helpful assistant that creates concise professional summaries. " +
        "Respond ONLY with valid JSON matching the exact schema provided.",
      prompt: `
Given the following LinkedIn profile information, create:
1. A short professional summary (2-3 sentences)
2. Exactly two interesting facts about this person

Profile data:
${JSON.stringify(profileData, null, 2)}

Respond with JSON in this exact format:
{
  "summary": "<short summary>",
  "facts": ["<fact 1>", "<fact 2>"]
}
      `.trim(),
    }).then(({ text }) => {
      const jsonMatch =
        text.match(/```(?:json)?\s*([\s\S]*?)```/) ??
        text.match(/(\{[\s\S]*\})/);

      const jsonStr = jsonMatch ? jsonMatch[1] : text;

      const parsed = summarySchema.parse(JSON.parse(jsonStr ?? "{}"));
      return { object: parsed };
    });

    childLogger.info("Ice-breaker generated successfully");

    return object;
  }
}
