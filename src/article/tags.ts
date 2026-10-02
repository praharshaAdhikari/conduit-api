/** Trims, drops blanks and removes repeats, keeping the first of each in order. */
export function normalizeTags(names: string[]): string[] {
  const seen = new Set<string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}
