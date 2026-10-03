/** Sold report helpers. Part of the sold feature; not in upstream Shelf. */

/** "YYYY-MM-DD" → a Date, or null if empty or invalid. */
export function parseDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

/** One CSV field: quoted when needed, and text that a spreadsheet would run as a formula is defused. */
export function csvField(value: string | number | null) {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
