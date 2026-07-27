import { generateText, isStepCount, Output } from "ai";
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

export class ResearchProfile {
  private readonly openai: ReturnType<typeof createOpenAI>;

  constructor(
    private readonly searchAdapter: SearchGateway,
    private readonly proxycurlAdapter: ProxycurlAdapter,
    private readonly modelId: string,
    openaiApiKey: string
  ) {
    this.openai = createOpenAI({ apiKey: openaiApiKey });
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

    const { output } = await generateText({
      model: this.openai(this.modelId),
      output: Output.object({ schema: summarySchema }),
      system: "You are a helpful assistant that creates concise professional summaries.",
      prompt: `
Given the following LinkedIn profile information, create:
1. A short professional summary (2-3 sentences)
2. Exactly two interesting facts about this person

Profile data:
${JSON.stringify(profileData, null, 2)}
      `.trim(),
    });

    childLogger.info("Ice-breaker generated successfully");

    return output;
  }
}
