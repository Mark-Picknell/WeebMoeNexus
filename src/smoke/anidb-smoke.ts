/**
 * Deliberately isolated one-request smoke test.
 * Invoke only when explicitly testing the registered AniDB client.
 * Offline unit tests never run this file.
 */
import { loadAniDbConfig } from "../config.js";
import { animeRecordSchema } from "../domain/anime.js";
import { AnimeService } from "../services/anime-service.js";

async function main(): Promise<void> {
  const config = loadAniDbConfig();
  if (config.client !== "weebmoenexus" || config.clientVersion !== 1) {
    throw new Error("Unexpected AniDB client identity. Check configuration.");
  }

  const anime = animeRecordSchema.parse(
    await new AnimeService(config).getByAniDbId(15437)
  );

  if (anime.id !== 15437) {
    throw new Error("AniDB returned an unexpected anime ID.");
  }
  if (!anime.titles.some((title) => /akudama\s+drive/i.test(title.value))) {
    throw new Error("AniDB response did not contain the expected Akudama Drive title.");
  }

  console.log(
    JSON.stringify({
      result: "PASS",
      animeId: anime.id,
      preferredTitle: anime.preferredTitle,
      titleCount: anime.titles.length,
      characterCount: anime.characters.length,
      episodeCount: anime.episodeCount,
      provenance: anime.provenance[0]?.sourceUrl
    })
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected smoke-test failure";
  console.error(`[AniDB smoke test failed] ${message}`);
  process.exitCode = 1;
});
