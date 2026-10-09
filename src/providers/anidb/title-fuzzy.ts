/**
 * Bounded Optimal String Alignment distance (adjacent transposition costs 1).
 *
 * This intentionally favors conservative typo correction over aggressive
 * semantic similarity. Unicode code points are compared directly; the caller
 * supplies normalized keys, never rewritten canonical titles.
 *
 * Returns null when the edit distance exceeds the budget.
 */
export function boundedTitleEditDistance(
  left: string,
  right: string,
  budget: number
): number | null {
  if (!Number.isInteger(budget) || budget < 0 || budget > 3) {
    throw new RangeError("Fuzzy edit budget must be between 0 and 3");
  }
  const a = [...left];
  const b = [...right];
  const n = a.length;
  const m = b.length;

  if (Math.abs(n - m) > budget) return null;
  if (left === right) return 0;

  const over = budget + 1;
  let twoBack = Array<number>(m + 1).fill(over);
  let previous = Array.from({ length: m + 1 }, (_, j) => j);

  for (let i = 1; i <= n; i++) {
    const row = Array<number>(m + 1).fill(over);
    row[0] = i <= budget ? i : over;
    const minJ = Math.max(1, i - budget);
    const maxJ = Math.min(m, i + budget);
    for (let j = minJ; j <= maxJ; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + cost
      );
      if (
        i > 1 && j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        row[j] = Math.min(row[j]!, twoBack[j - 2]! + 1);
      }
    }
    twoBack = previous;
    previous = row;
  }
  return previous[m]! <= budget ? previous[m]! : null;
}

/**
 * No fuzzy match for very short names; a single typo is too ambiguous.
 * Longer titles can tolerate proportionately more transcription errors.
 */
export function titleEditBudget(codePointCount: number): number {
  if (codePointCount < 4) return 0;
  if (codePointCount < 8) return 1;
  if (codePointCount < 15) return 2;
  return 3;
}
