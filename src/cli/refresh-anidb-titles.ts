import { AniDbTitleDumpCache } from "../providers/anidb/title-dump.js";
import { loadAniDbTitleIndex } from "../providers/anidb/title-index.js";

// Manual/operational refresh only. Never triggered by CI or module import.
try {
  const result = await new AniDbTitleDumpCache().get();
  process.stdout.write(
    `AniDB title dump ${result.source === "download" ? "downloaded" : "reused"}: ${result.path} (${result.compressedBytes} bytes)${result.stale ? " — stale cache; upstream refresh failed" : ""}\n`
  );
  const index = await loadAniDbTitleIndex(result.path);
  process.stdout.write(
    `Parsed ${index.animeCount} distinct anime and ${index.titleCount} title entries from local cache.\n`
  );
  // A stale snapshot is usable, but a scheduled refresh should surface failure.
  if (result.stale) process.exitCode = 1;
} catch (error) {
  process.stderr.write(
    `AniDB title dump unavailable: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
