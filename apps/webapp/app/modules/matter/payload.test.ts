/**
 * Matter setup codes (fork), against the Matter SDK's own test values: the
 * test passcode 20202021 with discriminator 3840 has the manual code
 * 34970112332.
 */
import { describe, expect, it } from "vitest";
import {
  formatManualCode,
  manualCode,
  parseManualCode,
  parseMatterCode,
  parseQrPayload,
  qrPayload,
  verhoeff,
  type MatterSetup,
} from "./payload";

const test: MatterSetup = {
  version: 0,
  vendorId: 0xfff1,
  productId: 0x8000,
  flow: 0,
  rendezvous: 2,
  discriminator: 3840,
  shortDiscriminator: false,
  passcode: 20202021,
};

describe("the manual code", () => {
  it("is the SDK's 34970112332 for its test device", () => {
    expect(manualCode(test)).toBe("34970112332");
    expect(formatManualCode("34970112332")).toBe("3497-011-2332");
  });
  it("reads back the passcode and the short discriminator", () => {
    expect(parseManualCode("3497-011-2332")).toMatchObject({
      passcode: 20202021,
      discriminator: 15, // 3840's top 4 bits
      shortDiscriminator: true,
      vendorId: null,
    });
  });
  it("carries the vendor and product in the 21-digit kind", () => {
    const long = manualCode(test, true);
    expect(long).toHaveLength(21);
    expect(parseManualCode(long)).toMatchObject({
      vendorId: 0xfff1,
      productId: 0x8000,
    });
  });
  it("catches a mistyped digit", () => {
    expect(() => parseManualCode("34970112333")).toThrow(/mistyped/);
    expect(verhoeff("3497011233")).toBe(2);
  });
});

describe("the Matter SDK's published example QR codes", () => {
  it("read as its test device: vendor 0xFFF1, passcode 20202021, discriminator 3840", () => {
    expect(parseQrPayload("MT:-24J042C00KA0648G00")).toMatchObject({
      vendorId: 0xfff1,
      productId: 0x8001,
      rendezvous: 2, // BLE
      discriminator: 3840,
      passcode: 20202021,
    });
    expect(parseQrPayload("MT:-24J0AFN00KA0648G00").rendezvous).toBe(4); // on the network
  });
  it("is written exactly as the SDK writes it", () => {
    expect(qrPayload(test)).toBe("MT:Y.K9042C00KA0648G00");
  });
});

describe("the QR text", () => {
  it("round-trips: written, then read back the same", () => {
    const text = qrPayload(test);
    expect(text).toMatch(/^MT:[0-9A-Z.-]{19}$/);
    expect(parseQrPayload(text)).toEqual(test);
  });
  it("gives the same manual code as the device's own", () => {
    expect(manualCode(parseQrPayload(qrPayload(test)))).toBe("34970112332");
  });
  it("tells the two kinds apart, and refuses what isn't a code", () => {
    expect(parseMatterCode(qrPayload(test)).vendorId).toBe(0xfff1);
    expect(parseMatterCode("34970112332").shortDiscriminator).toBe(true);
    expect(() => parseMatterCode("hello")).toThrow();
  });
  it("can't make a QR from the 11 digits alone", () => {
    expect(() => qrPayload(parseManualCode("34970112332"))).toThrow(/QR/);
  });
});
