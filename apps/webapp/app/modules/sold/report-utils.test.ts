import { describe, expect, it } from "vitest";
import { csvField, parseDay } from "./report-utils";

describe("parseDay", () => {
  it("reads a date and rejects anything else", () => {
    expect(parseDay("2026-10-03")?.toISOString()).toBe(
      "2026-10-03T00:00:00.000Z"
    );
    expect(parseDay("")).toBeNull();
    expect(parseDay(null)).toBeNull();
    expect(parseDay("03/10/2026")).toBeNull();
    expect(parseDay("2026-02-31")).toBeNull();
  });
});

describe("csvField", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(csvField('Genelec 8040, "pair"')).toBe('"Genelec 8040, ""pair"""');
    expect(csvField("plain")).toBe("plain");
    expect(csvField(null)).toBe("");
  });

  it("leaves numbers alone, including losses", () => {
    expect(csvField(-45.5)).toBe("-45.5");
    expect(csvField(1200)).toBe("1200");
  });

  it("stops text being run as a spreadsheet formula", () => {
    expect(csvField('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvField("+44 phone")).toBe("'+44 phone");
  });
});
