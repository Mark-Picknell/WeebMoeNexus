export type HttpMode = "local" | "public" | "bearer";
export interface HttpConfig {
  mode: HttpMode;
  bindHost: string;
  port: number;
  allowedHosts: string[];
  allowedOrigins: string[];
  bearerToken?: string;
}
const loopbacks = ["localhost", "127.0.0.1", "[::1]"];
const invalid = () => new Error("Invalid HTTP deployment configuration; inspect the deployment runbook.");

/** Environment values and secrets never appear in configuration errors. */
export function loadHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const mode = env.WMN_HTTP_MODE ?? "local";
  if (!["local", "public", "bearer"].includes(mode)) throw invalid();
  const port = Number(env.PORT ?? "3000");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw invalid();
  const bindHost = env.WMN_BIND_HOST ?? (mode === "local" ? "127.0.0.1" : "0.0.0.0");
  if (mode === "local" && !["127.0.0.1", "::1", "localhost"].includes(bindHost)) throw invalid();
  if (mode === "public" && env.WMN_PUBLIC_READ_ONLY !== "true") throw invalid();
  const bearerToken = mode === "bearer" ? env.WMN_BEARER_TOKEN : undefined;
  if (mode === "bearer" && (!bearerToken || bearerToken.length < 32 || !/^[\x21-\x7e]+$/.test(bearerToken))) throw invalid();
  const allowedHosts = mode === "local" ? loopbacks : (env.WMN_ALLOWED_HOSTS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (mode !== "local" && (!allowedHosts.length || allowedHosts.length > 16 || allowedHosts.some(host => {
    if (!/^[a-z0-9.-]+$/.test(host)) return true;
    try { return new URL(`https://${host}`).hostname !== host; } catch { return true; }
  }))) throw invalid();
  const allowedOrigins = (env.WMN_ALLOWED_ORIGINS ?? "").split(",").map(x => x.trim()).filter(Boolean);
  if (allowedOrigins.length > 16 || allowedOrigins.some(origin => {
    try { const url = new URL(origin); return !["https:", "http:"].includes(url.protocol) || url.origin !== origin || !!url.username || !!url.password; }
    catch { return true; }
  })) throw invalid();
  return { mode: mode as HttpMode, bindHost, port, allowedHosts, allowedOrigins, bearerToken };
}
