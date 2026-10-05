import { describe, expect, it, vi } from "vitest";

vi.mock("~/utils/env", () => ({
  SESSION_SECRET: "test-session-secret-0123456789",
}));

import { decryptSecret, encryptSecret, isEncrypted } from "./secret-box.server";

describe("secret box", () => {
  it("round-trips and doesn't store the secret as plain text", () => {
    const stored = encryptSecret("sk-ant-api03-abcdef");
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("abcdef");
    expect(decryptSecret(stored)).toBe("sk-ant-api03-abcdef");
  });
  it("gives a different ciphertext each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });
  it("passes a legacy plain-text value through, and never re-encrypts an encrypted one", () => {
    expect(decryptSecret("old plain password")).toBe("old plain password");
    const stored = encryptSecret("x");
    expect(encryptSecret(stored)).toBe(stored);
  });
  it("treats empty as empty and a tampered value as unreadable", () => {
    expect(encryptSecret("")).toBe("");
    expect(decryptSecret("")).toBe("");
    const stored = encryptSecret("secret");
    const tampered =
      stored.slice(0, -4) + (stored.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(decryptSecret(tampered)).toBe("");
  });
});
