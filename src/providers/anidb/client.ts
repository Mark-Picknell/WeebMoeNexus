import type { AniDbConfig } from "../../config.js";
import { RateGate } from "../../infrastructure/rate-gate.js";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ProviderLookupError, type ProviderError } from "../../domain/provider-error.js";
import type { ProviderConfiguration } from "../../domain/provider-health.js";

/** Same preflight used by reads and inspection; returns no configuration values. */
export function aniDbConfigurationState(config: AniDbConfig): ProviderConfiguration {
  if (!config.client.trim()) return "not_configured";
  try {
    const url = new URL(config.apiUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        !Number.isSafeInteger(config.clientVersion) || config.clientVersion <= 0) return "invalid_configuration";
    return "ready";
  } catch { return "invalid_configuration"; }
}

export class AniDbConfigurationError extends ProviderLookupError {
  constructor(message: string, reason: "missing_client" | "invalid_configuration" = "missing_client") {
    super({ code: "misconfigured", reason, message, httpStatus: null, apiCode: null });
    this.name = "AniDbConfigurationError";
  }
}
export class AniDbUpstreamError extends ProviderLookupError {
  constructor(
    message: string,
    code: ProviderError["code"] = "unavailable",
    reason: ProviderError["reason"] = "api_error",
    httpStatus: number | null = null,
    apiCode: number | null = null
  ) {
    super({ code, reason, message, httpStatus, apiCode });
    this.name = "AniDbUpstreamError";
  }
}

const errorParser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text",
  parseTagValue: false, parseAttributeValue: false
});

// Match explicit root-error labels only. Numeric HTTP API codes are preserved
// but not assigned meanings without an inspectable official reference.
function classifyApiError(label: string): ProviderError["code"] {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  if (["banned", "client banned"].includes(normalized)) return "banned";
  if (["no such anime", "anime not found"].includes(normalized)) return "not_found";
  if (["client version outdated", "client version is outdated"].includes(normalized)) return "outdated";
  if (["unknown client", "invalid client", "client not registered"].includes(normalized)) return "misconfigured";
  return "unavailable";
}

const apiMessages: Record<ProviderError["code"], string> = {
  not_found: "AniDB reported no such anime for this lookup. No retry was attempted.",
  banned: "AniDB reported a ban/backoff state. No retry was attempted.",
  outdated: "AniDB reported an outdated client version. Update the registered client configuration; no retry was attempted.",
  misconfigured: "AniDB rejected the client configuration. No retry was attempted.",
  unavailable: "AniDB returned an unclassified API error. No retry was attempted."
};

export class AniDbClient {
  private readonly gate: RateGate;

  constructor(private readonly config: AniDbConfig) {
    this.gate = new RateGate(config.minIntervalMs);
  }

  get configured(): boolean {
    return this.config.client.trim().length > 0;
  }

  get configurationState(): ProviderConfiguration {
    return aniDbConfigurationState(this.config);
  }

  async getAnimeXml(anidbId: number): Promise<string> {
    const configuration = this.configurationState;
    if (configuration === "not_configured") {
      throw new AniDbConfigurationError(
        "ANIDB_CLIENT is not configured. Register an AniDB API client and set ANIDB_CLIENT."
      );
    }
    if (configuration === "invalid_configuration") {
      throw new AniDbConfigurationError(
        "AniDB endpoint or client version is misconfigured. No request was made.", "invalid_configuration"
      );
    }
    const url = new URL(this.config.apiUrl);

    return this.gate.run(async () => {
      url.searchParams.set("request", "anime");
      url.searchParams.set("client", this.config.client);
      url.searchParams.set("clientver", String(this.config.clientVersion));
      url.searchParams.set("protover", "1");
      url.searchParams.set("aid", String(anidbId));

      let response: Response;
      let body: string;
      try {
        response = await fetch(url, {
          headers: { "User-Agent": "WeebMoeNexus/0.1.0" },
          signal: AbortSignal.timeout(15_000)
        });
        if (response.status === 429) {
          throw new AniDbUpstreamError(
            "AniDB rate-limited this request; back off. No retry was attempted.",
            "unavailable", "rate_limited", 429
          );
        }
        body = await response.text();
      } catch (error) {
        if (error instanceof ProviderLookupError) throw error;
        throw new AniDbUpstreamError(
          "AniDB request or response transfer failed. No retry was attempted.",
          "unavailable", "network_error"
        );
      }

      const validXml = XMLValidator.validate(body) === true;
      if (validXml) {
        const document = errorParser.parse(body) as Record<string, unknown>;
        if ("error" in document) {
          const node = document.error;
          const fields = node && typeof node === "object" ? node as Record<string, unknown> : {};
          const label = typeof node === "string" ? node : String(fields["#text"] ?? "");
          const rawCode = fields["@_code"];
          const parsedCode = typeof rawCode === "string" && /^\d+$/.test(rawCode) ? Number(rawCode) : NaN;
          const apiCode = Number.isSafeInteger(parsedCode) ? parsedCode : null;
          const code = classifyApiError(label);
          throw new AniDbUpstreamError(apiMessages[code], code, "api_error", response.status, apiCode);
        }
      }

      if (!response.ok) {
        throw new AniDbUpstreamError(
          `AniDB HTTP error ${response.status}; request was not retried.`,
          "unavailable", "http_error", response.status
        );
      }
      if (!validXml) {
        throw new AniDbUpstreamError(
          "AniDB returned malformed XML. No retry was attempted.",
          "unavailable", "invalid_response", response.status
        );
      }

      return body;
    });
  }
}
