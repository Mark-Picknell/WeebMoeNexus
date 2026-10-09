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

## GQ-007 — Euphoria: adult visual novel, animation, and source-medium identity

> Euphoria

Initial candidate: *euphoria* (CLOCKUP), a Japanese adult visual novel from 2011.

Related media:

- Original visual novel (2011), by CLOCKUP, with its own creator and character/performance credits.
- Distinct adult OVA adaptation produced by Majin, six installments issued from 2011 to 2016.
- Related print work *euphoria ~another room~* (2011).
- Preserve the producer, format, release date, and content-rating provenance per work and territory. Never collapse source game, anime adaptation, and novel into one record.
- The original *euphoria* game lists voice actress **青空ラムネ (Aozora Ramune)** for **Nemu Manaka**; independent credits identify her as **Ringo Aoba (青葉りんご)**. Preserve credit-name/alias context for this performer.

Acceptance:

1. A generic title query presents clearly distinguished game, anime, and novel entities, ranked by likely user intent, with links rather than forcing one into a single media-type identity.
2. Mature-content labels remain available as source-reported metadata; the default result can explain the work without fetching/showing explicit imagery.
3. The performer alias `Aozora Ramune` must link to Ringo Aoba only with supported evidence; separate on-screen acting roles from music credits.
4. User must not be led to believe any anime adaptation was independently verified through WeebMoeNexus; this is a future acceptance test.

Sources:

- https://w.atwiki.jp/ercr/pages/388.html (original game date, CLOCKUP, staff, voice-acting credit under 青空ラムネ)
- https://www.a1c.jp/~majin/product/eupho01.html (animation studio's original-adaptation identification, adult-site advisory)
- https://www.imdb.com/title/tt9252794/fullcredits/ (animation voice credits and Aozora Ramune alias)
- https://en.wikipedia.org/wiki/Euphoria_(visual_novel) (work adaptation history, verify individual assertions at providers)

## GQ-008 — Ofureru: partial-romaji source-title fragment

> Ofureru

**User-confirmed intended resolution:** *Overflow* (おーばーふろぉ), a 2020 adult short-form anime produced by Studio Hōkiboshi. Mark explicitly confirmed on 2026-10-08 that `Ofureru` was his breadcrumb toward *Overflow*; it remains a nonexact, evidence-requiring query.

Retrieval challenge:

- The user's input `Ofureru` isn't the anime's displayed short title `Overflow`.
- It occurs within some Latin-alphabet romanizations of the **extended source manga title**, *Overflow ~Iretara Ofureru Kyoudai no Kimochi~*. Other sources render the phrase `Afureru`; variations in transliteration and Japanese spelling must not be flattened without evidence.
- The animated series and source manga are related but distinct works; retrieve via token/subtitle/romanization normalization plus `adapted from` relation, with match evidence.
- The 2020 anime has eight short episodes. Its televised/broadcast presentation and complete adult edition are **release variants of the same production**, to be distinguished when discussing different content, rights, and audio/translation.
- Competing matches for `Ofureru` are possible in general. The answer to **this specific user-authored test** is confirmed as *Overflow*, but a production search engine must still rank candidates from source data rather than hard-code Mark's answer.
- Mark considered using **おーばーふろぉ** instead: this is the anime's stylized Japanese-script title and should resolve via an exact Japanese-script title index, a *separate retrieval path* from the `Ofureru` fragment in the longer source-media subtitle.

Acceptance:

1. `search_anime("Ofureru")` resolves *Overflow* as a well-evidenced candidate via the related source manga's extended title, despite failing exact short-title matching.
2. Display `matched phrase: Iretara Ofureru ...`, source and title type, confidence / ambiguity, and Japanese-script match where available.
3. `search_anime("おーばーふろぉ")` also resolves *Overflow* via the Japanese-script anime title; show that this match is direct while the romanized subtitle fragment requires a different path.
4. Preserve original manga `adapted into` anime, and broadcast vs full-version release relationships without treating them as new unrelated shows.
5. Never infer that the two named side-quest works are in one franchise merely because they share adult-content categories.

Sources:

- https://www.crunchyroll.com/es/news/latest/2020/1/7/el-anime-overflow-contar-con-tan-solo-ocho-episodios (original manga extended title, 8-episode anime, broadcast vs complete editions, production)
- https://www.animeclick.it/anime/29284/overflow (extended romaji, Japanese script, adaptation and episode count)
- https://overflow.cf-anime.com/goods/ (official anime goods including manga titles and editions)

## GQ-009 — Euphoria ↔ Overflow: indirect musician / inserted song

> Euphoria
>
> Ofureru

**Independently evidenced relationship, explicitly affirmed as real by Mark (2026-10-08):** This shared-performer link stands alongside the separately confirmed `Ofureru` → *Overflow* title resolution. User confirmation is not a substitute for credit provenance, and does not establish that this was the only intended relationship:

- **Ringo Aoba (青葉りんご)** is credited as **Aozora Ramune (青空ラムネ)** for Nemu Manaka in *euphoria*. The *euphoria* OVA credits Aoba as Nemu and with theme-song vocals.
- In *Overflow* (2020), episode **5** uses the insert song **恋愛☆洗セーション (Ren'ai Sai Session)** performed by Ringo Aoba and Ayaka Igasaki; this song **originates in the 2019 show** *Araiya-san! Ore to Aitsu ga Onnayu de!?* and is not *Overflow*'s primary theme song.
- This yields a **performer ↔ voice role ↔ musical performance ↔ reuse in another work** path. The relationship is indirect and must not be presented as shared lead cast, an adaptation, or a shared franchise.

Acceptance:

1. Search both inputs independently and resolve the `Ofureru` hypothesis as a possible partial romanization of *Overflow*.
2. Detect evidence-supported shared performer, with the person's aliases cross-referenced, credit types and *which episode* used the song.
3. Explain the role of the intervening third show in the song's origin and keep work identity separate.
4. If music/source detail is absent from provider, report incomplete evidence instead of inventing direct staff or cast relationships.
5. Preserve the user's explicit validation that this is a **real discovered connection**; still distinguish user validation from source evidence, and do not claim it was the only intended hidden connection.

Sources:

- https://www.imdb.com/title/tt9252794/fullcredits/ (*euphoria* performer / alias credit)
- https://cal.syoboi.jp/tid/5512/subtitle (original Japanese *Overflow* broadcast records list song, performer, episode 5)
- https://overflow.cf-anime.com/goods/ (official *Overflow* goods page identifies *Araiya-san!* as the original source of the song)
- https://www.imdb.com/title/tt14962432/fullcredits/ (additional music credit for Ringo Aoba in *Overflow*)

## GQ-010 — Ambiguous adult/anime name is not a genre restriction

> Euphoria
>
> Ofureru

**User correction (2026-10-08):** Mark emphasized that both inputs have non-hentai and related non-anime media, revealing a search failure: early analysis overfocused on adult animation and took a plausible genre match as if it exhausted the name and relationship space. Mark later explicitly confirmed that `Ofureru` was intended to lead to *Overflow*, and said he almost sent the stylized Japanese-script title `おーばーふろぉ` instead.

### Confirmed examples of broader discovery

**Euphoria** is highly ambiguous across unrelated works and media:

- CLOCKUP's 2011 adult visual novel, its adult OVA, and a related novel are adaptation/media links.
- **Euphoria (2019 HBO series)** is a **live-action** teen drama starring Zendaya, inspired by an **Israeli television series of the same name** (2012–13). The American series and Israeli original are linked by adaptation; neither is adapted from CLOCKUP's game. These are namesakes, **not one work**.
- Other live-action films called *Euphoria* and music titles are also independent title collisions, not extensions of the game franchise.

**Ofureru** is a confirmed user-intended *query*, but not the canonical anime title:

- The string occurs in romanizations of the subtitle of the adult manga *Overflow ~Iretara Ofureru Kyoudai no Kimochi~*, which was adapted as the 2020 anime *Overflow*.
- The production had a **standard broadcast version** distinct from its **complete adult edition**. Preserve this difference; source-reported classifications must not be overwritten by a single uniform “hentai” label.
- The source **manga is non-anime media**, but “not anime” does **not** automatically mean “non-explicit.” Do not assume that a manga adaptation is non-hentai or that the broadcast version is free of mature material.
- Mark confirmed that *Overflow* is the intended answer for this test. General-purpose retrieval still needs broader candidates and should never treat his confirmed example as proof that every ambiguous query has one unique answer.

### Acceptance criteria

1. An unqualified `Euphoria` search should expose independently named works in game, animation, live-action television, film, books, and music as relevant to the user's stated scope. Group linked adaptations separately from namesakes.
2. `Ofureru` should return transparently ranked possible matches and explain whether its string matches a canonical title, subtitle, romanization variant, or other source field.
3. Both queries should discover relevant **non-anime media** and, if present, **non-explicit editions/works**, while preserving each source's actual content classification.
4. Do not merge unrelated works because they share a title; do not hide meaningful adaptations because media differ.
5. Ensure safe default display of metadata and non-explicit previews without erasing age-restriction information.
6. Where media are outside AniDB's coverage, mark them as external-provider discovery or future adapter work, not as already-resolved AniDB entities.

Sources:

- https://www.hulu.jp/euphoria (Japan's Hulu listing for the unrelated HBO live-action television drama)
- https://www.unext.co.jp/ja/press-room/euphoria-2026-04-13 (Japanese distributor announcement of HBO television series)
- https://en.wikipedia.org/wiki/Euphoria_(disambiguation) (scope of namesake works, cross-check individual media as needed)
- https://www.akibastation.es/2019/11/anime-de-overflow.html (original manga and two anime presentation versions)
- https://www.animeclick.it/manga/29490/overflow (original source manga information)

## GQ-011 — Yoshimitsu: character vs inherited mantle vs cursed weapon across franchises

> Yoshimitsu

**User candidate (2026-10-09):** Mark suggested Yoshimitsu as a character who crosses apparently different media and franchises. His precise intended surprise has not been explicitly confirmed. The research finds a stronger issue than a shared cameo: the name refers to **multiple individual people, a succession title, and a named weapon**.

Entities / relationships to keep distinct:

1. **TEKKEN** (1994 onward): the modern Yoshimitsu is leader of the Manji Clan, uses Manji Ninjutsu, and wields the cursed blade Yoshimitsu. The official *Tekken 8* biography explicitly says both the weapon and clan leadership pass between generations of Manji heads. His reinforced armor is upgraded by Dr. Bosconovitch.
2. **Soulcalibur** (series begins 1998, story set centuries before modern Tekken): a historical Yoshimitsu is clan leader in the 16th century. In the original *Soulcalibur V* continuity, **Yoshimitsu II** kills/succeeds his mentor **Yoshimitsu I**, inheriting the name, status and cursed sword. These are explicitly separate people. Source cites published *Soulcalibur V* profile text via the character archives.
3. **Soulcalibur VI** is a reimagined/rebooted timeline, returning to the earlier historical Yoshimitsu. An identity graph must distinguish timeline/reimagining from a new person's succession.
4. **Yoshimitsu the sword** is also the proper name of a cursed blade passed along with the succession title, not merely a prop whose name coincides with the owner's. Model it as an item/weapon entity.
5. **Crossover appearance and transmedia:** *Street Fighter X Tekken* includes Yoshimitsu as a playable crossover fighter. *Tekken: The Motion Picture* (1998 animated OVA) and *Tekken: Bloodline* (2022 anime) include brief Yoshimitsu appearances. The 2009 live-action *Tekken* film depicts him in another continuity. Crossover guest roles, adaptations, and succession are distinct relation types.
6. **Release order vs fictional chronology:** Yoshimitsu debuted in *Tekken* before he appeared in *Soulcalibur*, whose **fictional setting** predates modern Tekken by centuries. Do not use in-universe time as release-date sorting, or vice versa.

Graph sketch:

```text
Yoshimitsu (name / mantle / lineage)
  ├─ held_by ── Soulcalibur Yoshimitsu I ──[succeeded_by]── Yoshimitsu II
  ├─ associated_with ── modern Tekken Yoshimitsu (later Manji leader)
  ├─ represented_by ── Cursed Blade Yoshimitsu (weapon)
  ├─ associated_with ── Manji Clan / Manji Ninjutsu
  ├─ appears_in ── Tekken games, Soulcalibur games
  └─ portrayed_in ── Tekken animation and live-action adaptations
```

Acceptance:

1. A `search_character("Yoshimitsu")` request returns a **disambiguation group** with historical and modern individuals, inherited mantle, cursed weapon, and canonical game/media appearances.
2. Avoid falsely asserting one immortal individual fights in both *Soulcalibur* and modern *Tekken*, while surfacing the connection between them prominently.
3. Represent `succeeded_by`, `member_of`, `uses_weapon`, `appearance_in`, `reboot_version_of`, and `adaptation_portrayal` separately, with credible evidence.
4. Index game-title characters even though the first WeebMoeNexus provider AniDB covers anime—not games—without claiming the present MCP server already supports this search.
5. When anime appearance is only a cameo, say so. Do not mislabel *Tekken* as an anime-origin franchise.
6. Store provenance on individual claims. Historical, modern, reboot, and adapted interpretations are different types of relationship, not mutually exclusive answers.

Sources:
- https://tekken.com/fighters/yoshimitsu (Bandai Namco official *Tekken 8* biography of modern Manji succession and named sword)
- https://soulcalibur.fandom.com/wiki/Yoshimitsu/Yoshimitsu_II (*Soulcalibur V* profile transcription of succession ritual, weapon and identity)
- https://soulcalibur.fandom.com/wiki/Yoshimitsu/New_Timeline (*Soulcalibur VI* reboot timeline)
- https://tekken.fandom.com/wiki/Yoshimitsu (Tekken/Soulcalibur and crossover relations; check original works)
- https://tekken.fandom.com/wiki/Tekken:_Bloodline (anime cameo; secondary reference)
- https://en.wikipedia.org/wiki/Tekken:_The_Motion_Picture (animated OVA appearance; corroborate with direct credits where available)

## GQ-012 — Ashikaga Yoshimitsu: historical person, namesake ambiguity, and anime portrayal

> Ashikaga Yoshimitsu

**Follow-up to GQ-011 (2026-10-09):** Mark supplied the historical name **Ashikaga Yoshimitsu**, adding a separate ambiguity to the previously tested *Tekken/Soulcalibur* Yoshimitsu. Treat this as a historical-person search and discover the cross-media depictions; do **not** invent kinship, namesake inspiration, or an in-universe succession relationship with Bandai Namco's fighting-game character.

### Different names under the same Roman letters

- **足利義満** (Ashikaga Yoshimitsu; Japanese given name **義満**), historical third Ashikaga shōgun (1358–1408), a well-documented Muromachi-era political and cultural figure.
- **吉光** (Yoshimitsu), the *Tekken* / *Soulcalibur* fictional Manji fighter's name and the name of the inherited cursed sword. The Japanese script and component kanji **differ** even though the Romanized reading is the same. This is homophony/name-collision, not an alias for the shogun.
- The historical person lived centuries before *Tekken*'s modern setting and decades before the earliest fictional *Soulcalibur* setting; chronological overlap cannot establish ancestry or character identity. At present there is **no verified official claim** that Namco/Bandai Namco named its Yoshimitsu after Ashikaga Yoshimitsu. Omit that proposed link unless credible evidence emerges.

### Real historical person portrayed in anime

1. **Ikkyū-san / 一休さん** (Toei Animation, 1975–1982), a fictionalized historical comedy about young monk Ikkyū. Official Toei cast credits **足利義満** voiced by **Shunji Yamada (山田俊司)**. The shogun is a recurring foil for Ikkyū's riddles and wit. This is a **fictional portrayal of a historical person**, not the real person's filmography or proof the dramatic scenarios occurred.
2. **The World Is Dancing / ワールド イズ ダンシング** (2026, adaptation of Kazuto Mihara's Noh-history manga). The official anime's character page identifies **Ashikaga Yoshimitsu**, voiced by **Takahiro Sakurai (櫻井孝宏)**. This is a separate depiction of the **same real historical person**, not a character crossover or same fictional continuity.
3. Related non-anime media include historical biographies and manga, notably **Akkanbe Ikkyu** (Hisashi Sakaguchi), in which Yoshimitsu appears. Preserve media type and distinguish historical evidence from dramatized interpretation.

### Relationships / acceptance

- `search_person("Ashikaga Yoshimitsu")` resolves the historical person as a different entity from `search_character("Yoshimitsu")`.
- Japanese input `足利義満` and `義満` should provide strong direct matches for the shōgun. `吉光` should directly resolve the fictional game persona / title or weapon, NOT the shōgun, despite shared kana reading.
- `Yoshimitsu` by itself should return disambiguated groups including **historical people**, **fictional individuals and inherited mantles**, and **items named Yoshimitsu**, rather than blindly selecting the fighting-game character or shōgun.
- Represent historical-person **depicted_as** fictional portrayals in separate works; map each portrayal to its actor/voice actor, not to the historical person as if they literally had a voice actor.
- Distinguish `shared_name/pronunciation` (linguistic), `portrayal_of` (media representation), `succession/inherited_title` (in-fiction), `inspired_by` (requires documented authorial evidence), and `appears_in` (production role).
- The first release of WeebMoeNexus is an AniDB anime-by-ID client; these are requirements for later title/person/character/cross-provider adapters, not working MCP searches.

Sources:

- https://jpsearch.go.jp/en/gallery/ndl-JVK2pJ3xwPu34K (Japanese cultural heritage aggregator; historical Ashikaga Yoshimitsu)
- https://tk8.tekken-official.jp/character/index.php?chara=yoshimitsu (Bandai Namco's official Japanese page uses 吉光)
- https://lineup.toei-anim.co.jp/ja/tv/ikkyu/story/ (Toei's original *Ikkyū-san* cast explicitly lists 足利義満 and 山田俊司)
- https://sh-anime.shochiku.co.jp/worldisdancing-anime/character/yoshimitsu/ (2026 *The World Is Dancing* official cast lists 足利義満 and 櫻井孝宏)
- https://www.nippon.com/en/japan-topics/b07211/ (historical Ikkyū versus fictional portrayal context)
- https://www.japanesewiki.com/person/Yoshimitsu%20ASHIKAGA.html (non-anime historical/literary/manga portrayals; verify individual titles when adapters implemented)

## Rule

Golden queries are tests of capability, not shortcuts. Never special-case the answer into tool code.
