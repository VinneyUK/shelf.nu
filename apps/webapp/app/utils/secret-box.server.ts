/**
 * Secrets at rest (fork): AES-256-GCM, with the key derived from SESSION_SECRET.
 * Used for the Anthropic API key and the mailbox app password, so neither sits
 * in the database as plain text.
 *
 * Stored as "enc:v1:" + base64(iv | auth tag | ciphertext). A value without
 * that prefix is a legacy plain-text one and is passed through unchanged, so
 * existing data keeps working and is encrypted the next time it's saved.
 *
 * If SESSION_SECRET ever changes, stored secrets can't be decrypted and read
 * back as empty: enter them again.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { SESSION_SECRET } from "~/utils/env";

const PREFIX = "enc:v1:";
let cachedKey: Buffer | null = null;

function key() {
  cachedKey ??= scryptSync(SESSION_SECRET, "shelf-fork-secret-box", 32);
  return cachedKey;
}

export const isEncrypted = (value: string) => value.startsWith(PREFIX);

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  if (isEncrypted(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return (
    PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")
  );
}

/** The secret, or "" if it's empty, tampered with, or from another SESSION_SECRET. */
export function decryptSecret(stored: string): string {
  if (!stored) return "";
  if (!isEncrypted(stored)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      raw.subarray(0, 12)
    );
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
