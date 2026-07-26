import { logger } from "../../shared/logger";

// ---- Domain types ----

export interface LinkedInGroup {
  name?: string;
  url?: string;
  profile_pic_url?: string;
  [key: string]: unknown;
}

export interface LinkedInProfile {
  full_name?: string;
  headline?: string;
  summary?: string;
  occupation?: string;
  country?: string;
  city?: string;
  experiences?: unknown[];
  education?: unknown[];
  languages?: unknown[];
  accomplishment_projects?: unknown[];
  accomplishment_publications?: unknown[];
  accomplishment_honors_awards?: unknown[];
  groups?: Omit<LinkedInGroup, "profile_pic_url">[];
  [key: string]: unknown;
}

// ---- Fields to always strip ----

const EXCLUDED_KEYS = new Set([
  "people_also_viewed",
  "certifications",
  "activities",
  "similarly_named_profiles",
]);

// ---- Adapter ----

export class ProxycurlAdapter {
  private readonly apiKey: string;
  private readonly baseUrl =
    "https://nubela.co/proxycurl/api/v2/linkedin";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async scrapeProfile(linkedInUrl: string): Promise<LinkedInProfile> {
    logger.info({ linkedInUrl }, "Scraping LinkedIn profile via Proxycurl");

    const url = new URL(this.baseUrl);
    url.searchParams.set("url", linkedInUrl);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Proxycurl request failed: ${response.status} ${response.statusText}`
      );
    }

    const raw = (await response.json()) as Record<string, unknown>;

    const profile = this.filterProfile(raw);

    logger.info(
      { linkedInUrl, fieldCount: Object.keys(profile).length },
      "LinkedIn profile scraped successfully"
    );

    return profile;
  }

  private filterProfile(
    data: Record<string, unknown>
  ): LinkedInProfile {
    // Remove empty values and excluded keys (mirrors the Python original)
    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (EXCLUDED_KEYS.has(key)) continue;
      if (this.isEmpty(value)) continue;
      filtered[key] = value;
    }

    // Strip profile_pic_url from groups entries
    if (Array.isArray(filtered["groups"])) {
      filtered["groups"] = (
        filtered["groups"] as LinkedInGroup[]
      ).map(({ profile_pic_url: _pic, ...rest }) => rest);
    }

    return filtered;
  }

  private isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (value === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  }
}
