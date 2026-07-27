import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: never[]) => mockGenerateText(...args),
  isStepCount: () => () => false,
  Output: { object: (opts: unknown) => opts },
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn((modelId: string) => `mock-model:${modelId}`)),
}));

import { ResearchProfile } from "./research-profile.feature";
import type { SearchGateway } from "./search-gateway";
import type { ProxycurlAdapter } from "../adapters/linkedin/proxycurl.adapter";
import type { LinkedInProfile } from "../adapters/linkedin/proxycurl.adapter";

const mockSearch: SearchGateway = {
  findLinkedInUrl: vi.fn(),
};

const mockProxycurl = {
  scrapeProfile: vi.fn(),
} as never as ProxycurlAdapter;

const PROFILE_FIXTURE: LinkedInProfile = {
  full_name: "John Doe",
  headline: "Senior Software Engineer at Acme Corp",
  summary: "Passionate engineer with 10+ years of experience.",
  occupation: "Senior Software Engineer",
  country: "US",
  experiences: [{ company: "Acme Corp", title: "Senior SWE" }],
  education: [{ school: "MIT" }],
};

const EXPECTED_RESULT = {
  summary: "Experienced senior engineer with a strong background in software.",
  facts: ["Has 10+ years of experience", "Graduated from MIT"],
};

const makeFeature = () =>
  new ResearchProfile(mockSearch, mockProxycurl, "gpt-4o", "sk-test");

const mockAgentCall = (linkedInUrl: string) => {
  mockGenerateText.mockImplementationOnce(
    async (opts: { tools?: Record<string, { execute?: (args: { name: string }) => Promise<unknown> }> }) => {
      if (opts.tools?.["searchLinkedIn"]?.execute) {
        await opts.tools["searchLinkedIn"].execute({ name: "John Doe" });
      }
      return { text: linkedInUrl };
    }
  );
};

const mockSummarizationCall = (result: typeof EXPECTED_RESULT) => {
  mockGenerateText.mockImplementationOnce(async () => ({
    output: result,
  }));
};

describe("ResearchProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockSearch.findLinkedInUrl).mockResolvedValue(
      "https://www.linkedin.com/in/john-doe"
    );
    mockProxycurl.scrapeProfile.mockResolvedValue(PROFILE_FIXTURE);
  });

  it("returns summary and facts for a valid name", async () => {
    mockAgentCall("https://www.linkedin.com/in/john-doe");
    mockSummarizationCall(EXPECTED_RESULT);

    const feature = makeFeature();
    const result = await feature.execute({ name: "John Doe" });

    expect(result.summary).toBe(EXPECTED_RESULT.summary);
    expect(result.facts).toEqual(EXPECTED_RESULT.facts);
    expect(result.facts).toHaveLength(2);
  });

  it("calls searchAdapter.findLinkedInUrl with the provided name", async () => {
    mockAgentCall("https://www.linkedin.com/in/john-doe");
    mockSummarizationCall(EXPECTED_RESULT);

    const feature = makeFeature();
    await feature.execute({ name: "John Doe" });

    expect(mockSearch.findLinkedInUrl).toHaveBeenCalledWith("John Doe");
  });

  it("calls proxycurl.scrapeProfile with the resolved LinkedIn URL", async () => {
    const expectedUrl = "https://www.linkedin.com/in/john-doe";
    mockAgentCall(expectedUrl);
    mockSummarizationCall(EXPECTED_RESULT);

    const feature = makeFeature();
    await feature.execute({ name: "John Doe" });

    expect(mockProxycurl.scrapeProfile).toHaveBeenCalledWith(expectedUrl);
  });

  it("trims whitespace from the resolved LinkedIn URL", async () => {
    mockAgentCall("  https://www.linkedin.com/in/john-doe  ");
    mockSummarizationCall(EXPECTED_RESULT);

    const feature = makeFeature();
    await feature.execute({ name: "John Doe" });

    expect(mockProxycurl.scrapeProfile).toHaveBeenCalledWith(
      "https://www.linkedin.com/in/john-doe"
    );
  });

  it("calls generateText twice", async () => {
    mockAgentCall("https://www.linkedin.com/in/john-doe");
    mockSummarizationCall(EXPECTED_RESULT);

    const feature = makeFeature();
    await feature.execute({ name: "John Doe" });

    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("throws when the LLM agent call fails", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("OpenAI rate limit"));

    const feature = makeFeature();
    await expect(feature.execute({ name: "John Doe" })).rejects.toThrow(
      "OpenAI rate limit"
    );
  });

  it("throws when proxycurl scraping fails", async () => {
    mockAgentCall("https://www.linkedin.com/in/john-doe");
    mockProxycurl.scrapeProfile.mockRejectedValueOnce(
      new Error("Proxycurl 401")
    );

    const feature = makeFeature();
    await expect(feature.execute({ name: "John Doe" })).rejects.toThrow("Proxycurl 401");
  });

  it("throws when the summarization call fails", async () => {
    mockAgentCall("https://www.linkedin.com/in/john-doe");
    mockGenerateText.mockRejectedValueOnce(new Error("schema validation failed"));

    const feature = makeFeature();
    await expect(feature.execute({ name: "John Doe" })).rejects.toThrow(
      "schema validation failed"
    );
  });
});
