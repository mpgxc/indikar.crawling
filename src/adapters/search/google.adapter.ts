import type { SearchGateway } from "../../features/search-gateway";
import { logger } from "../../shared/logger";

interface GoogleSearchItem {
  link?: string;
}

interface GoogleSearchResponse {
  error?: { message: string };
  items?: GoogleSearchItem[];
}

export class GoogleCustomSearchAdapter implements SearchGateway {
  private readonly apiKey: string;
  private readonly cseId: string;
  private readonly baseUrl =
    "https://www.googleapis.com/customsearch/v1";

  constructor(apiKey: string, cseId: string) {
    this.apiKey = apiKey;
    this.cseId = cseId;
  }

  async findLinkedInUrl(name: string): Promise<string> {
    const query = `${name} LinkedIn profile site:linkedin.com/in`;

    logger.info({ adapter: "google", query }, "Searching LinkedIn URL");

    const url = new URL(this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("cx", this.cseId);
    url.searchParams.set("num", "5");

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Google Custom Search request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as GoogleSearchResponse;

    const extracted = this.extractUrl(data);

    logger.info({ adapter: "google", extracted }, "LinkedIn URL found");

    return extracted;
  }

  private extractUrl(res: GoogleSearchResponse): string {
    if (res.error) {
      throw new Error(`Google Search API error: ${res.error.message}`);
    }

    const firstLink = res.items?.[0]?.link;
    if (firstLink) return firstLink;

    throw new Error("No LinkedIn URL found in Google Search response");
  }
}
