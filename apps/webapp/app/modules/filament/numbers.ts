/**
 * Filament numbers: FIL-0001, FIL-0002… one per filament (line and colour),
 * shared by every spool and refill of it, for its QR label. The rules that
 * don't need the database. Part of the filament labels feature (fork).
 */

export const FIL_PREFIX = "FIL";

export function formatFilamentId(number: number) {
  return `${FIL_PREFIX}-${String(number).padStart(4, "0")}`;
}

/** The number in a filament ID as typed: "FIL-0007", "fil-7", "FIL7". */
export function parseFilamentNumber(text: string): number | null {
  const m = text.trim().match(new RegExp(`^${FIL_PREFIX}-?0*(\\d{1,8})$`, "i"));
  return m ? Number(m[1]) : null;
}

/**
 * The filaments still to be numbered, in the order they get their numbers:
 * by when their first spool or refill was added (then by key, so two added
 * in the same instant always come out the same way).
 */
export function toNumber(
  items: { key: string; createdAt: Date | string }[],
  numbered: Set<string>
): string[] {
  const first = new Map<string, number>();
  for (const item of items) {
    if (numbered.has(item.key)) continue;
    const t = new Date(item.createdAt).getTime();
    const seen = first.get(item.key);
    if (seen === undefined || t < seen) first.set(item.key, t);
  }
  return [...first.entries()]
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key]) => key);
}

/** The line and colour back from a key, for the filament's page address. */
export function keyParts(key: string) {
  const at = key.indexOf("|");
  return at < 0
    ? { type: key, colourName: "" }
    : { type: key.slice(0, at), colourName: key.slice(at + 1) };
}
