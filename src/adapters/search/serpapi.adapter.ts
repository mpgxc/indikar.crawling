import type { SearchGateway } from "../../features/search-gateway";
import { logger } from "../../shared/logger";

interface SerpApiOrganicResult {
  link?: string;
}

interface SerpApiAnswerBox {
  answer?: string;
  snippet?: string;
  snippet_highlighted_words?: string[];
}

interface SerpApiResponse {
  error?: string;
  answer_box?: SerpApiAnswerBox;
  organic_results?: SerpApiOrganicResult[];
}

export class SerpApiAdapter implements SearchGateway {
  private readonly apiKey: string;
  private readonly baseUrl = "https://serpapi.com/search.json";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async findLinkedInUrl(name: string): Promise<string> {
    const query = `${name} LinkedIn profile site:linkedin.com/in`;

    logger.info({ adapter: "serpapi", query }, "Searching LinkedIn URL");

    const url = new URL(this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("engine", "google");
    url.searchParams.set("num", "5");

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `SerpAPI request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as SerpApiResponse;

    const extracted = this.extractUrl(data);

    logger.info({ adapter: "serpapi", extracted }, "LinkedIn URL found");

    return extracted;
  }

  private extractUrl(res: SerpApiResponse): string {
    if (res.error) {
      throw new Error(`SerpAPI error: ${res.error}`);
    }

    if (res.answer_box?.answer) return res.answer_box.answer;
    if (res.answer_box?.snippet) return res.answer_box.snippet;
    if (res.answer_box?.snippet_highlighted_words?.[0]) {
      return res.answer_box.snippet_highlighted_words[0];
    }

    const firstLink = res.organic_results?.[0]?.link;
    if (firstLink) return firstLink;

    throw new Error("No LinkedIn URL found in SerpAPI response");
  }
}
