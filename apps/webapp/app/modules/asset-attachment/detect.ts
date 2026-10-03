/**
 * Works out what an uploaded file really is from its contents, so a renamed
 * HTML page or script can't be stored and served as if it were a PDF.
 * Part of the attachments feature; not in upstream Shelf.
 */

export type DetectedAttachment = {
  contentType:
    | "application/pdf"
    | "image/jpeg"
    | "image/png"
    | "image/heic"
    | "image/heif"
    | "message/rfc822";
  extension: string;
};

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);
const HEIF_BRANDS = new Set(["mif1", "msf1"]);

// Header lines found at the top of a saved email (RFC 5322)
const EMAIL_HEADER =
  /^(from|to|cc|subject|date|received|return-path|message-id|mime-version|delivered-to|reply-to|x-[\w-]+):/im;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot > -1 ? fileName.slice(dot + 1).toLowerCase() : "";
}

/**
 * Returns the file's real type, or null if it isn't one we accept.
 * `bytes` only needs to be the start of the file (4 KB is plenty).
 */
export function detectAttachmentType(
  bytes: Uint8Array,
  fileName: string
): DetectedAttachment | null {
  // %PDF-
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { contentType: "application/pdf", extension: "pdf" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", extension: "png" };
  }
  // ISO base media file: "ftyp" at byte 4, then the brand
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (HEIC_BRANDS.has(brand)) {
      return { contentType: "image/heic", extension: "heic" };
    }
    if (HEIF_BRANDS.has(brand)) {
      return { contentType: "image/heif", extension: "heif" };
    }
    return null;
  }
  // Saved emails are plain text with no fixed signature, so require the .eml
  // name, no binary content, and an email header near the top.
  if (extensionOf(fileName) === "eml") {
    const head = bytes.slice(0, 4096);
    if (head.includes(0)) return null;
    const text = new TextDecoder("latin1").decode(head);
    if (/<\s*(html|script|svg|!doctype)/i.test(text.slice(0, 512))) return null;
    if (EMAIL_HEADER.test(text)) {
      return { contentType: "message/rfc822", extension: "eml" };
    }
  }
  return null;
}
