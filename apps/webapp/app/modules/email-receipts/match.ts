/**
 * Email receipts: deciding what an email is for. No I/O, so it's easy to test.
 * Part of the email receipts feature; not in upstream Shelf.
 */

/**
 * Asset IDs named in a subject, upper-cased and without repeats, e.g.
 * "Fwd: order SAM-0017 and sam-18" → ["SAM-0017", "SAM-18"].
 */
export function assetIdsInSubject(subject: string): string[] {
  const found = subject.match(/\b[A-Z]{2,10}-\d{1,8}\b/gi) ?? [];
  return [...new Set(found.map((id) => id.toUpperCase()))];
}

/** The allowed senders box: one address per line (or commas), lower-cased. */
export function parseAllowedSenders(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
    ),
  ];
}

export function isAllowedSender(
  from: string | null | undefined,
  allowed: string[]
) {
  return Boolean(from) && allowed.includes(from!.trim().toLowerCase());
}

type MailPart = {
  filename?: string;
  contentType: string;
  contentDisposition?: string;
  related?: boolean;
  size: number;
};

/**
 * The parts worth keeping: real attachments, not the logos and spacer images
 * that make up the email's design (those are "related" or inline).
 */
export function receiptParts<T extends MailPart>(parts: T[]): T[] {
  return parts.filter(
    (part) =>
      part.size > 0 &&
      !part.related &&
      part.contentDisposition !== "inline" &&
      /^(application\/pdf|image\/(jpeg|png|heic|heif))$/i.test(part.contentType)
  );
}

/** A tidy name for the saved email, e.g. "2026-10-03 Your order has shipped.eml". */
export function emailFileName(subject: string, date: Date | null | undefined) {
  const cleaned = subject
    .replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const day =
    date && !isNaN(date.getTime()) ? `${date.toISOString().slice(0, 10)} ` : "";
  return `${day}${cleaned || "Email receipt"}.eml`;
}
