/**
 * Matter setup codes (fork): the "MT:…" text in a device's QR code, and the
 * 11- or 21-digit manual pairing code printed under it. Reads either, works
 * out the other where it can, and writes the QR text back for a re-pair QR.
 * Following the Matter Core Specification's onboarding payload (5.1).
 */

export type MatterSetup = {
  version: number;
  vendorId: number | null;
  productId: number | null;
  /** 0 standard, 1 user action, 2 custom */
  flow: number;
  /** How it can be found: bit 0 SoftAP, bit 1 BLE, bit 2 on the network */
  rendezvous: number | null;
  /** The full 12 bits from a QR; from a manual code only its top 4 bits are known */
  discriminator: number;
  /** Whether the discriminator is only its top 4 bits (from a manual code) */
  shortDiscriminator: boolean;
  passcode: number;
};

const BASE38 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.";

function base38Decode(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 5) {
    const chunk = text.slice(i, i + 5);
    let value = 0;
    for (let j = chunk.length - 1; j >= 0; j--) {
      const d = BASE38.indexOf(chunk[j]);
      if (d < 0) throw new Error("That isn't a Matter code.");
      value = value * 38 + d;
    }
    const n =
      chunk.length === 5
        ? 3
        : chunk.length === 4
        ? 2
        : chunk.length === 2
        ? 1
        : -1;
    if (n < 0) throw new Error("That isn't a Matter code.");
    for (let k = 0; k < n; k++) bytes.push((value >> (8 * k)) & 0xff);
  }
  return bytes;
}

function base38Encode(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = bytes.slice(i, i + 3);
    let value = 0;
    for (let k = chunk.length - 1; k >= 0; k--) value = value * 256 + chunk[k];
    const chars = chunk.length === 3 ? 5 : chunk.length === 2 ? 4 : 2;
    for (let c = 0; c < chars; c++) {
      out += BASE38[value % 38];
      value = Math.floor(value / 38);
    }
  }
  return out;
}

/** Reads n bits, least significant first, from a byte array. */
function bitReader(bytes: number[]) {
  let pos = 0;
  return (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++, pos++)
      if (bytes[pos >> 3] & (1 << (pos & 7))) v += 2 ** i;
    return v;
  };
}

/** The "MT:…" text of a Matter QR code. */
export function parseQrPayload(text: string): MatterSetup {
  const body = text.trim().replace(/^MT:/i, "").split("*")[0].toUpperCase();
  const bytes = base38Decode(body);
  if (bytes.length < 11) throw new Error("That Matter code is too short.");
  const read = bitReader(bytes);
  const setup: MatterSetup = {
    version: read(3),
    vendorId: read(16),
    productId: read(16),
    flow: read(2),
    rendezvous: read(8),
    discriminator: read(12),
    shortDiscriminator: false,
    passcode: read(27),
  };
  if (!validPasscode(setup.passcode))
    throw new Error("That Matter code's passcode isn't valid.");
  return setup;
}

/** Writes the "MT:…" text for a QR code, from a full setup. */
export function qrPayload(s: MatterSetup): string {
  if (s.shortDiscriminator || s.vendorId === null || s.productId === null)
    throw new Error("A QR code needs the code from the device's QR.");
  const fields: [number, number][] = [
    [s.version, 3],
    [s.vendorId, 16],
    [s.productId, 16],
    [s.flow, 2],
    [s.rendezvous ?? 2, 8],
    [s.discriminator, 12],
    [s.passcode, 27],
    [0, 4],
  ];
  const bytes = new Array(11).fill(0);
  let pos = 0;
  for (const [value, n] of fields)
    for (let i = 0; i < n; i++, pos++)
      if (Math.floor(value / 2 ** i) % 2) bytes[pos >> 3] |= 1 << (pos & 7);
  return `MT:${base38Encode(bytes)}`;
}

// ---------------------------------------------------- the manual code

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** The Verhoeff check digit for a string of digits. */
export function verhoeff(digits: string) {
  let c = 0;
  const rev = digits.split("").reverse().map(Number);
  for (let i = 0; i < rev.length; i++) c = D[c][P[(i + 1) % 8][rev[i]]];
  return INV[c];
}

/** The passcodes Matter doesn't allow (too easy to guess). */
export function validPasscode(p: number) {
  const banned = [
    0, 11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777,
    88888888, 99999999, 12345678, 87654321,
  ];
  return p > 0 && p < 99999999 && !banned.includes(p);
}

/** The manual pairing code: 11 digits, or 21 with the vendor and product IDs. */
export function manualCode(s: MatterSetup, withIds = false) {
  const short = s.shortDiscriminator ? s.discriminator : s.discriminator >> 8;
  const ids = withIds && s.vendorId !== null && s.productId !== null;
  const d1 = ((ids ? 1 : 0) << 2) | (short >> 2);
  const d2 = ((short & 0x3) << 14) | (s.passcode & 0x3fff);
  const d3 = s.passcode >> 14;
  let code = `${d1}${String(d2).padStart(5, "0")}${String(d3).padStart(
    4,
    "0"
  )}`;
  if (ids)
    code += `${String(s.vendorId).padStart(5, "0")}${String(
      s.productId
    ).padStart(5, "0")}`;
  return code + verhoeff(code);
}

/** "3497-011-2332" (and "…-…" for the 21-digit kind). */
export function formatManualCode(code: string) {
  const c = code.replace(/\D/g, "");
  return c.length === 11
    ? `${c.slice(0, 4)}-${c.slice(4, 7)}-${c.slice(7)}`
    : `${c.slice(0, 4)}-${c.slice(4, 7)}-${c.slice(7, 11)}-${c.slice(
        11,
        16
      )}-${c.slice(16)}`;
}

/** The 11- or 21-digit manual pairing code. */
export function parseManualCode(text: string): MatterSetup {
  const c = text.replace(/[\s-]/g, "");
  if (!/^\d{11}$|^\d{21}$/.test(c))
    throw new Error("A Matter code is 11 or 21 digits, or the MT:… text.");
  if (verhoeff(c.slice(0, -1)) !== Number(c.slice(-1)))
    throw new Error("Those digits don't check out: is one mistyped?");
  const d1 = Number(c[0]);
  const d2 = Number(c.slice(1, 6));
  const d3 = Number(c.slice(6, 10));
  const ids = (d1 >> 2) & 1;
  if (ids !== (c.length === 21 ? 1 : 0))
    throw new Error("Those digits don't check out: is one mistyped?");
  const passcode = (d3 << 14) | (d2 & 0x3fff);
  if (!validPasscode(passcode))
    throw new Error("That Matter code's passcode isn't valid.");
  return {
    version: 0,
    vendorId: c.length === 21 ? Number(c.slice(10, 15)) : null,
    productId: c.length === 21 ? Number(c.slice(15, 20)) : null,
    flow: 0,
    rendezvous: null,
    discriminator: ((d1 & 0x3) << 2) | (d2 >> 14),
    shortDiscriminator: true,
    passcode,
  };
}

/** Either kind of code, as typed, pasted or read from a QR. */
export function parseMatterCode(text: string): MatterSetup {
  const t = text.trim();
  return /^MT:/i.test(t) ? parseQrPayload(t) : parseManualCode(t);
}

/** "0x130A". */
export const hexId = (n: number | null) =>
  n === null ? null : `0x${n.toString(16).toUpperCase().padStart(4, "0")}`;
