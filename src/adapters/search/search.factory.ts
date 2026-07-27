import type { Config } from "../../shared/config";
import type { SearchGateway } from "../../features/search-gateway";
import { SerpApiAdapter } from "./serpapi.adapter";
import { GoogleCustomSearchAdapter } from "./google.adapter";

export function createSearchAdapter(config: Config): SearchGateway {
  if (config.SEARCH_PROVIDER === "google") {
    if (!config.GOOGLE_API_KEY || !config.GOOGLE_CSE_ID) {
      throw new Error(
        "SEARCH_PROVIDER=google requires GOOGLE_API_KEY and GOOGLE_CSE_ID"
      );
    }
    return new GoogleCustomSearchAdapter(
      config.GOOGLE_API_KEY,
      config.GOOGLE_CSE_ID
    );
  }

  if (!config.SERPAPI_KEY) {
    throw new Error("SEARCH_PROVIDER=serpapi requires SERPAPI_KEY");
  }
  return new SerpApiAdapter(config.SERPAPI_KEY);
}
