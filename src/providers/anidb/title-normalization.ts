/**
 * Deterministic title-key normalization for AniDB's *supplied* aliases.
 *
 * Never translates Japanese to English, invents romanization, or merges anime
 * records. Exact Unicode titles and original spellings remain authoritative.
 */
const romanMacrons: Readonly<Record<string, string>> = {
  "ā": "aa", "ē": "ee", "ī": "ii", "ō": "ou", "ū": "uu",
  "Ā": "aa", "Ē": "ee", "Ī": "ii", "Ō": "ou", "Ū": "uu"
};

/**
 * Normalize case, fullwidth/compatibility forms, and punctuation for lookup.
 *
 * Latin accents can be omitted in search keys, but Japanese dakuten/handakuten
 * MUST NOT be removed: カ and ガ remain distinct.
 */
export function normalizeAniDbTitle(value: string): string {
  const compatible = value.normalize("NFKC").toLowerCase();
  // Strip marks only from Latin precomposed letters, not Japanese characters.
  const latinFolded = compatible.replace(/[\u00c0-\u024f\u1e00-\u1eff]/gu,
    char => char.normalize("NFD").replace(/\p{M}/gu, "")
  );
  return latinFolded
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

/**
 * Add a conservative alternate for common macron-bearing Hepburn titles.
 * Example: Chōjikū Yōsai -> choujikuu yousai (while retaining the simpler
 * chōjikū -> chojiku fold). This expands explicitly written macrons only.
 *
 * Non-macron spellings do NOT receive guessed transliterations. Other Japanese
 * and English aliases must actually be present in AniDB's title dump.
 */
export function aniDbTitleLookupKeys(value: string): readonly string[] {
  const keys = new Set<string>();
  const basic = normalizeAniDbTitle(value);
  if (basic) keys.add(basic);

  if (/[āēīōūĀĒĪŌŪ]/u.test(value)) {
    const expanded = value.replace(/[āēīōūĀĒĪŌŪ]/gu,
      character => romanMacrons[character] ?? character
    );
    const expandedKey = normalizeAniDbTitle(expanded);
    if (expandedKey) keys.add(expandedKey);
  }
  return [...keys];
}
