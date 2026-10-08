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

## Rule

Golden queries are tests of capability, not shortcuts. Never special-case the answer into tool code.
