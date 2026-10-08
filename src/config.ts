export interface AniDbConfig {
  client: string;
  clientVersion: number;
  apiUrl: string;
  minIntervalMs: number;
  cacheTtlMs: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadAniDbConfig(): AniDbConfig {
  return {
    client: process.env.ANIDB_CLIENT?.trim() ?? "",
    clientVersion: intEnv("ANIDB_CLIENT_VERSION", 1),
    apiUrl:
      process.env.ANIDB_HTTP_API_URL?.trim() ??
      "http://api.anidb.net:9001/httpapi",
    minIntervalMs: Math.max(2000, intEnv("ANIDB_MIN_INTERVAL_MS", 2500)),
    cacheTtlMs: Math.max(60_000, intEnv("ANIDB_CACHE_TTL_MS", 259_200_000))
  };
}

export function loadPort(): number {
  return Math.max(1, Math.min(65535, intEnv("PORT", 3000)));
}
