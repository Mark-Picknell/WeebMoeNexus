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
4. Until a supported staff/person search provider is implemented, report this capability as pending rather than pretending the existing \`get_anime_by_anidb_id\` MCP tool supports it.

Reference:

- https://emou.net/profile/ (voice actor's official profile)
- https://www.imdb.com/title/tt12331342/fullcredits/ (*Akudama Drive* credits)

## GQ-003 — Legacy anime title, translated aliases, and identity

> Super Dimension Fortress Macross

Expected resolution:

- **Original 1982–1983 TV series**, not one of its movies, sequels, localization adaptations, or *Macross Frontier*.
- Original Japanese title: **超時空要塞マクロス**.
- Recognize the aliases **The Super Dimension Fortress Macross**, **Chōjikū Yōsai Macross**, **Choujikuu Yousai Macross**, and **Macross** when disambiguated.
- Expected AniDB ID: **77** (\`a77\`).
- Independent cross-reference: MyAnimeList anime ID **1088**, AniList anime ID **1088**. Identical numeric values across providers do not imply that provider IDs are interchangeable.
- TV series episode count: **36**.

Acceptance criteria:

1. \`search_anime("Super Dimension Fortress Macross")\` returns AniDB \`77\` with explicit alias-match evidence.
2. Preserve source-specific IDs; do not route a MAL ID into the AniDB API just because both happen to share a number here.
3. Handle ambiguous \`Macross\` with title type/year/context, and avoid merging the original show with *Do You Remember Love?*, *Robotech*, or later Macross installments.
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
2. Join \`person -> credited role -> anime\` only when relationship evidence exists.
3. Missing credits or incomplete episode metadata must remain **unknown/not documented**, not converted to authoritative **confirmed absent**.
4. Show where each claim comes from; confidence and provenance matter more than supplying a satisfying relationship.

References:

- https://macross.anime.net/wiki/The_Super_Dimension_Fortress_Macross
- https://emou.net/profile/
- https://macross.anime.net/wiki/Macross_Frontier

## Rule

Golden queries are tests of capability, not shortcuts. Never special-case the answer into tool code.
