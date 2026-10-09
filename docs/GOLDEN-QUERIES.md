# Golden Queries

These are real user-facing queries that WeebMoeNexus should eventually answer from normalized provider data. They are acceptance targets, not hard-coded answers.

## GQ-001 — The query that started it

> Find the hot pink-haired doctor with a scalpel.

Expected resolution:

- Anime: **Akudama Drive**
- AniDB anime ID: **15437** (`a15437`)
- Character: **Isha / Doctor** (official Japanese name: 医者)
- AniDB character ID: **108685** (`ch108685`)
- Character page: https://anidb.net/character/108685

### Ground-truth traits supplied from the AniDB character record

Identity / body:

- gender identity: female
- height: 175 cm
- weight: 52 kg
- blood type: B
- date of birth: 09.06.????

Abilities / role:

- genius
- poison user
- mad scientist

Accessories / clothing:

- sunglasses
- skirt
- miniskirt
- boots
- thigh boots
- high heels
- lab coat
- elastic hair tie
- string necklace
- lipstick

Appearance:

- exposed midriff
- yellow eyes
- eye shadow
- blue hair highlights
- pink hair
- polished nails
- fair skin

Weapons:

- knife
- surgical scalpels

AniDB also exposes community-oriented metadata such as waifu/trash ratings and fetish-appeal tags. Those should remain provider/community metadata rather than being promoted into universal core identity fields.

### Why this is a strong golden query

Mark's original recollection was not vague in any meaningful sense. The remembered discriminators were highly specific:

```text
pink-haired
doctor
glasses/sunglasses
lab coat
scalpel / surgical imagery
```

Those cues map directly onto the AniDB record and uniquely narrow the search space. The acceptance test is therefore not "recover from a bad memory"; it is "resolve a natural-language memory that is semantically precise but not expressed in provider-native identifiers or canonical names."

## Why this matters

This query crosses several layers that should remain distinct:

```text
natural-language memory
    ↓
character attributes/tags
    ↓
character identity
    ↓
anime appearance relation
    ↓
anime identity
    ↓
provider provenance
```

A good result should not be produced by hard-coding this character. The system should be able to explain *why* the candidate matches and preserve which provider supplied each piece of evidence.

## Milestone progression

1. **Today:** resolve `a15437` by direct AniDB ID.
2. **Title index:** resolve “Akudama Drive” → `a15437`.
3. **Character extraction:** expose `ch108685` from the anime record.
4. **Character search:** resolve “Doctor” / “Isha” → `ch108685`.
5. **Attribute search:** combine tags such as pink hair + lab coat + surgical scalpels.
6. **Fuzzy recollection:** accept the original natural-language query and rank the correct character highly with evidence.


## GQ-002 — Voice actor name order and identity

> Ogata Megumi

Expected resolution:

- Entity type: **person / Japanese voice actor**, not a fictional character or anime title.
- Japanese name: **緒方恵美**.
- Common Western-order romanization: **Megumi Ogata**.
- Japanese-order romanization: **Ogata Megumi**.
- Recognize the two romanized variants as one person, retaining original-script and source-attributed aliases.
- A verified positive relationship: voice of **Doctor / Isha** from *Akudama Drive*, connecting to GQ-001. Do not conflate the person with the character.

Acceptance criteria:

1. Search handles both Japanese and Western name order and does not return two distinct persons solely because of swapped name components.
2. Can navigate person → credited character → anime, with provider and language/edition provenance as available.
3. Does not return unrelated people whose names merely contain "Megumi".
4. Until a supported staff/person search provider is implemented, report this capability as pending rather than pretending the existing `get_anime_by_anidb_id` MCP tool supports it.

Reference:

- https://emou.net/profile/ (voice actor's official profile)
- https://www.imdb.com/title/tt12331342/fullcredits/ (*Akudama Drive* credits)

## GQ-003 — Legacy anime title, translated aliases, and identity

> Super Dimension Fortress Macross

Expected resolution:

- **Original 1982–1983 Japanese TV series** as the primary catalog identity, not one of its movies, sequels, or *Macross Frontier*; prominently surface the **Robotech: The Macross Saga** adaptation relationship without conflating their release identities.
- Original Japanese title: **超時空要塞マクロス**.
- Recognize the aliases **The Super Dimension Fortress Macross**, **Chōjikū Yōsai Macross**, **Choujikuu Yousai Macross**, and **Macross** when disambiguated.
- Expected AniDB ID: **77** (`a77`).
- Independent cross-reference: MyAnimeList anime ID **1088**, AniList anime ID **1088**. Identical numeric values across providers do not imply that provider IDs are interchangeable.
- TV series episode count: **36**.

Acceptance criteria:

1. `search_anime("Super Dimension Fortress Macross")` returns AniDB `77` with explicit alias-match evidence.
2. Preserve source-specific IDs; do not route a MAL ID into the AniDB API just because both happen to share a number here.
3. Handle ambiguous `Macross` with title type/year/context. Do not merge the original show with *Do You Remember Love?*, *Robotech*, or later installments, but **do return Robotech: The Macross Saga as an adaptation / localized reworking**.
4. This is a **future title-index acceptance test**, not yet a successful plugin query.

References:

- https://macross.anime.net/wiki/The_Super_Dimension_Fortress_Macross (Macross Compendium)
- https://www.wikidata.org/wiki/Q702373 (independently collected cross-provider identifiers; verify IDs from each provider when adapters are implemented)

## GQ-004 — Do not hallucinate a cast relationship

User supplied both:

> Ogata Megumi
>
> Super Dimension Fortress Macross

These are **two independent side-quest search inputs**; their being named together is *not* evidence of a relationship.

Expected behavior when asked whether Ogata voices someone in the original 1982 *Macross* TV series:

- Do **not** invent a credit.
- The checked original *Macross* cast list does not identify her, and her official biography describes her anime voice-acting debut as Kurama in *Yu Yu Hakusho* (later than the 1982–1983 Macross series).
- Prefer an answer such as **"I couldn't verify a credit connecting Megumi Ogata to the original 1982 TV series"**, with evidence, over an absolute negative claim that the database coverage cannot justify.
- Also recognize that **Megumi Nakajima** (*Macross Frontier*) and **Megumi Ogata** are different voice actors; a shared given name is not a join key.

Acceptance criteria:

1. Person-name matching and work-title matching each resolve correctly on their own.
2. Join `person -> credited role -> anime` only when relationship evidence exists.
3. Missing credits or incomplete episode metadata must remain **unknown/not documented**, not converted to authoritative **confirmed absent**.
4. Show where each claim comes from; confidence and provenance matter more than supplying a satisfying relationship.

References:

- https://macross.anime.net/wiki/The_Super_Dimension_Fortress_Macross
- https://emou.net/profile/
- https://macross.anime.net/wiki/Macross_Frontier

## GQ-005 — Surface the relevant adaptation, not just the literal title

> Super Dimension Fortress Macross

**What Mark was testing:** Beyond resolving the original Japanese show's identity, does the system lead naturally to **Robotech**, the US adaptation many English-language viewers know? Earlier answers identified the original and even explicitly warned against merging Robotech, but buried/omitted the **positive adaptation relationship**. That is a relevance/ranking failure, not an entity-disambiguation success.

Expected presentation:

- **The Super Dimension Fortress Macross** — original Japanese television series (1982–1983; 36 episodes).
- **Robotech: The Macross Saga** — English-language adaptation/reworking of that series, forming the first 36 episodes of the 1985 American `Robotech` television series.
- `Robotech` incorporates material from three separate Japanese series, so it is **not** a simple English synonym for the entire `Macross` franchise: `Macross`, `Super Dimension Cavalry Southern Cross`, and `Genesis Climber Mospeada`.
- Localized/rewritten names illustrate the distinction: e.g., original Hikaru Ichijyo → Robotech's Rick Hunter, Misa Hayase → Lisa Hayes. Align people/characters/episodes across adaptations using **explicit edition-specific aliases/relationships and evidence**, not by erasing the identities of the original productions.
- Even if title search only matches the Japanese original, the answer should **include a related-release/adaptation hit prominently**, particularly when the user is searching from an English-language context.

Acceptance criteria:

1. Given the exact query, rank the primary original title correctly and surface `Robotech: The Macross Saga` with relation type **adapted into**, not same-as.
2. If relationship evidence is unavailable from the provider, report missing coverage rather than inventing an equivalence.
3. Support graph traversal in both directions: original Japanese anime → adapted release, and `Robotech` → Japanese source material.
4. Preserve differences in audio performances, character aliases, storyline edits, and episode mappings as edition/release-specific facts.
5. Do not treat `Ogata Megumi` as a voice credit for the original `Macross`; she is a separate voice-actor query from this side quest.

References:

- https://macross.anime.net/production/animation_live_action/first/index.html (Macross Compendium; lists `Robotech: The Macross Saga` in original production/release information)
- https://macc.bunka.go.jp/wp-content/uploads/2023/01/2013_JapaneseAnimationGuide.pdf (Japanese Agency for Cultural Affairs animation guide; describes `Macross` being reworked into `Robotech`)
- https://robotech.com/news/anime-news-network-at-anime-expo-harmony-gold-renews-license-to-1st-macross-southern-cross-mospeada-anime-series (licensed source series)
- https://macross.jp/contents/750039 (2021 official Big West / Harmony Gold agreement)

## GQ-006 — Yomigaeru Sora: alternate production, cross-media franchise, and shared creators

> Yomigaeru Sora

**Mark's intended discovery is deliberately undisclosed at entry time.** These are independently sourced connections found while exploring the title, not proof that any single one was his target.

Primary identity:

- *Yomigaeru Sora: Rescue Wings* (よみがえる空 -RESCUE WINGS-): 2006 Japanese television anime from J.C.Staff about search-and-rescue helicopter pilot Kazuhiro Uchida.
- AniDB anime ID **4113**; MyAnimeList anime ID **798** and AniList anime ID **798** are separate provider identities (the identical MAL/AniList numbers are coincidental and must remain namespaced).
- 12 broadcast episodes and an additional episode for the home-video release.

Relationships that a useful discovery result should surface:

1. **Alternate development branch / pilot:** *Rescue Angel* (レスキューエンジェル; AniList **103123**), roughly three minutes long, used an **originally female protagonist**, whereas the finished TV series features Kazuhiro Uchida as a male protagonist. AniList explicitly marks it as an alternative version; it is not automatically an ordinary TV episode or the same anime record.
2. **Related live-action production:** *Sora e: Sukui no Tsubasa Rescue Wings* (2008), centered on a female pilot named Haruka Kawashima. This belongs to the *Rescue Wings* media family and should be represented as a distinct production, not a literal English-title synonym.
3. **Related manga and title collision:** The franchise's original Japanese production site describes *Rescue Wings Zero* as having the earlier title *Rescue Angel* (旧タイトル：レスキューエンジェル). That manga title history must not be conflated with the **Rescue Angel** animation pilot. Likewise, *Sora e Rescue Wings* is another manga with its own publication/characters.
4. **Cross-query shared contributor:** *Rescue Angel* (pilot) credits **Shōji Kawamori** for mechanical design. His official biography credits him with original creation and mechanical design for *The Super Dimension Fortress Macross* (GQ-003 / GQ-005). The **finished Yomigaeru Sora TV series** instead credits **Takashi Hashimoto (橋本敬史)** for mechanical design. Credit attribution must target the correct production or version, never silently propagate from pilot to TV series.

Acceptance criteria:

1. Resolve the supplied title to **AniDB 4113** and surface related production/alternate-version/media links with named relation types.
2. If asked for *Rescue Angel*, distinguish the animation pilot from the manga **formerly** bearing that title; include medium, year, and source evidence.
3. Handle relationships that are **not** title aliases: pilot-to-TV alternative production; TV-to-film franchise connection; TV/pilot-to-manga related-work links; shared-staff link to an otherwise unrelated earlier query.
4. Do not claim the pilot and TV series had the same protagonist or production credits. Do not claim the 2008 movie retells identical events without evidence.
5. Give the viewer a clear answer even if a particular API lacks relationship edges; note where additional provider evidence was used.
6. Do not infer that Mark intended any particular connection until he reveals his own test target. This documents candidate discoveries, not a retrospectively invented expectation.

Evidence and sources:

- https://www.wikidata.org/wiki/Q4022858 (cross-provider identifier mapping, sparsely sourced; verify against providers when available)
- https://www.tv-tokyo.co.jp/contents/rescue-w/staff/ (original TV staff; Hashimoto credited for mechanical design)
- https://anilist.co/anime/103123/Rescue-Angel (pilot, female protagonist, alternative relationship, Kawamori mechanical credit)
- https://www.rescue-w.jp/2006/anime_goods.html (original franchise materials; *Rescue Wings Zero* previous title *Rescue Angel*)
- https://www.rescue-w.jp/2006/anime_info.html (original site's film description and its connection to the anime and manga)
- https://shojikawamori.jp/en/ (Kawamori official biography; original *Macross* creator/mechanical designer)

## Rule

Golden queries are tests of capability, not shortcuts. Never special-case the answer into tool code.
