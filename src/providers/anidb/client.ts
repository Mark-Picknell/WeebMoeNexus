import type { AniDbConfig } from "../../config.js";
import { RateGate } from "../../infrastructure/rate-gate.js";

export class AniDbConfigurationError extends Error {}
export class AniDbUpstreamError extends Error {}

export class AniDbClient {
  private readonly gate: RateGate;

  constructor(private readonly config: AniDbConfig) {
    this.gate = new RateGate(config.minIntervalMs);
  }

  get configured(): boolean {
    return this.config.client.length > 0;
  }

  async getAnimeXml(anidbId: number): Promise<string> {
    if (!this.config.client) {
      throw new AniDbConfigurationError(
        "ANIDB_CLIENT is not configured. Register an AniDB API client and set ANIDB_CLIENT."
      );
    }

    return this.gate.run(async () => {
      const url = new URL(this.config.apiUrl);
      url.searchParams.set("request", "anime");
      url.searchParams.set("client", this.config.client);
      url.searchParams.set("clientver", String(this.config.clientVersion));
      url.searchParams.set("protover", "1");
      url.searchParams.set("aid", String(anidbId));

      const response = await fetch(url, {
        headers: {
          "User-Agent": "WeebMoeNexus/0.1.0"
        },
        signal: AbortSignal.timeout(15_000)
      });

      const body = await response.text();

      if (!response.ok) {
        throw new AniDbUpstreamError(
          `AniDB HTTP error ${response.status}; request was not retried.`
        );
      }

      if (/\bbanned\b/i.test(body)) {
        throw new AniDbUpstreamError(
          "AniDB reported a ban/backoff state. No retry was attempted."
        );
      }

      if (/^\s*<error\b/i.test(body)) {
        throw new AniDbUpstreamError(
          `AniDB returned an API error: ${body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`
        );
      }

      return body;
    });
  }
}
