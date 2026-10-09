import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

export const ANIDB_TITLE_DUMP_URL = "https://anidb.net/api/anime-titles.xml.gz";
export const MIN_TITLE_DUMP_REFRESH_MS = 36 * 60 * 60 * 1000;
export const DEFAULT_TITLE_DUMP_REFRESH_MS = 48 * 60 * 60 * 1000;
const MAX_COMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_XML_BYTES = 128 * 1024 * 1024;

export type TitleDumpResult = {
  path: string;
  compressedBytes: number;
  source: "cache" | "download";
  stale: boolean;
};

export type TitleDumpFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface TitleDumpCacheOptions {
  path?: string;
  refreshIntervalMs?: number;
  fetcher?: TitleDumpFetch;
  now?: () => number;
}

type Cached = {
  buffer: Buffer;
  modifiedAt: number;
};

/**
 * Disk-backed, conservative downloader for AniDB's public title index.
 *
 * This uses the officially published HTTPS dump, not the rate-limited AniDB
 * HTTP API and not website scraping. All tests inject an offline fetcher.
 * The previous verified gzip remains available if an update fails.
 */
export class AniDbTitleDumpCache {
  private readonly path: string;
  private readonly refreshIntervalMs: number;
  private readonly fetcher: TitleDumpFetch;
  private readonly now: () => number;
  private inFlight: Promise<TitleDumpResult> | null = null;

  constructor(options: TitleDumpCacheOptions = {}) {
    this.path = resolve(
      options.path ?? process.env.ANIDB_TITLE_DUMP_CACHE_PATH ??
        ".cache/anidb/anime-titles.xml.gz"
    );
    this.refreshIntervalMs = Math.max(
      MIN_TITLE_DUMP_REFRESH_MS,
      options.refreshIntervalMs ?? DEFAULT_TITLE_DUMP_REFRESH_MS
    );
    this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? Date.now;
  }

  async get(): Promise<TitleDumpResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.loadOrRefresh().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async readCached(): Promise<Cached | null> {
    try {
      const buffer = await fs.readFile(this.path);
      validateTitleGzip(buffer);
      const info = await fs.stat(this.path);
      return { buffer, modifiedAt: info.mtimeMs };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      // A corrupt or truncated cache must be replaced rather than trusted.
      if (error instanceof InvalidTitleDumpError) return null;
      throw error;
    }
  }

  private async loadOrRefresh(): Promise<TitleDumpResult> {
    const cached = await this.readCached();
    const fresh =
      cached !== null &&
      this.now() - cached.modifiedAt < this.refreshIntervalMs &&
      this.now() >= cached.modifiedAt;
    if (fresh) {
      return this.result(cached.buffer, "cache", false);
    }

    try {
      const response = await this.fetcher(ANIDB_TITLE_DUMP_URL, {
        headers: { "User-Agent": "WeebMoeNexus/0.1.0" },
        signal: AbortSignal.timeout(20_000),
        redirect: "error"
      });
      if (!response.ok) {
        throw new Error(`AniDB title dump returned HTTP ${response.status}`);
      }
      const declaredSize = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredSize) && declaredSize > MAX_COMPRESSED_BYTES) {
        throw new InvalidTitleDumpError("Title dump exceeds compressed size limit");
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      validateTitleGzip(buffer);

      await fs.mkdir(dirname(this.path), { recursive: true });
      const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporaryPath, buffer, { mode: 0o600, flag: "wx" });
        await fs.rename(temporaryPath, this.path);
      } finally {
        await fs.rm(temporaryPath, { force: true });
      }
      return this.result(buffer, "download", false);
    } catch (error) {
      if (cached) return this.result(cached.buffer, "cache", true);
      throw error;
    }
  }

  private result(
    buffer: Buffer,
    source: TitleDumpResult["source"],
    stale: boolean
  ): TitleDumpResult {
    return { path: this.path, compressedBytes: buffer.length, source, stale };
  }
}

export class InvalidTitleDumpError extends Error {}

/** Reject HTML/error pages, truncated gzip, and decompression bombs. */
export function validateTitleGzip(bytes: Buffer): void {
  if (
    bytes.length < 3 ||
    bytes.length > MAX_COMPRESSED_BYTES ||
    bytes[0] !== 0x1f ||
    bytes[1] !== 0x8b
  ) {
    throw new InvalidTitleDumpError("AniDB title dump is not a valid-sized gzip");
  }
  let xml: Buffer;
  try {
    xml = gunzipSync(bytes, { maxOutputLength: MAX_XML_BYTES });
  } catch {
    throw new InvalidTitleDumpError("AniDB title dump failed bounded gzip decompression");
  }
  const document = xml.toString("utf8");
  if (
    !/<animetitles(?:\s|>)/.test(document) ||
    !/<\/animetitles\s*>\s*$/.test(document) ||
    !/<anime\s+aid="\d+"/.test(document) ||
    !/<title\s/.test(document)
  ) {
    throw new InvalidTitleDumpError("AniDB title dump has unexpected XML structure");
  }
}
