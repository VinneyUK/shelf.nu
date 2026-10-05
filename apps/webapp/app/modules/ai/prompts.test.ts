import { describe, expect, it } from "vitest";
import {
  cleanAmount,
  cleanDate,
  cleanPhotoResult,
  cleanReceiptResult,
  descriptionWithPurchase,
  photoContent,
  photoSystemPrompt,
} from "./prompts";

const categories = [
  { id: "cat-audio", name: "Audio", description: "Audio equipment" },
  { id: "cat-tools", name: "Tools" },
];

describe("the photo request", () => {
  it("lists the person's own categories and currency", () => {
    const content = photoContent(
      { type: "text", text: "(image)" },
      categories,
      "GBP"
    );
    const text = (content[1] as { text: string }).text;
    expect(text).toContain("cat-audio: Audio (Audio equipment)");
    expect(text).toContain("cat-tools: Tools");
    expect(text).toContain("Currency: GBP");
    expect(photoSystemPrompt("GBP")).toMatch(/UK/);
  });
});

describe("photo results", () => {
  it("keeps a valid item, marks the value as an estimate, and checks the category", () => {
    const [item] = cleanPhotoResult(
      {
        items: [
          {
            name: "  Genelec   8040 ",
            description: "Studio monitor.",
            estimatedValue: 799.999,
            categoryId: "cat-audio",
            notes: "",
          },
        ],
      },
      categories
    );
    expect(item).toMatchObject({
      name: "Genelec 8040",
      valuation: 800,
      valueEstimated: true,
      categoryId: "cat-audio",
      notes: null,
    });
  });
  it("drops a category that isn't the person's, and a nonsense value", () => {
    const [item] = cleanPhotoResult(
      {
        items: [
          {
            name: "Thing",
            description: "",
            estimatedValue: -5,
            categoryId: "made-up",
          },
        ],
      },
      categories
    );
    expect(item.categoryId).toBeNull();
    expect(item.valuation).toBeNull();
    expect(item.valueEstimated).toBe(false);
  });
  it("ignores nameless items, caps at five, and survives junk", () => {
    expect(
      cleanPhotoResult({ items: [{ name: "", description: "x" }] }, categories)
    ).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => ({
      name: `Item ${i}`,
      description: "",
      estimatedValue: 1,
      categoryId: null,
    }));
    expect(cleanPhotoResult({ items: many }, categories)).toHaveLength(5);
    expect(cleanPhotoResult({ items: "nope" }, categories)).toEqual([]);
    expect(cleanPhotoResult({}, categories)).toEqual([]);
  });
  it("keeps the name and description within Shelf's limits", () => {
    const [item] = cleanPhotoResult(
      {
        items: [
          {
            name: "N".repeat(500),
            description: "D".repeat(5000),
            estimatedValue: null,
            categoryId: null,
          },
        ],
      },
      categories
    );
    expect(item.name.length).toBe(120);
    expect(item.description.length).toBeLessThanOrEqual(1000);
  });
});

describe("receipt results", () => {
  it("records what was paid, the vendor and the date, and notes a quantity", () => {
    const [item] = cleanReceiptResult(
      {
        vendor: "Amazon",
        purchaseDate: "2026-09-30",
        items: [
          {
            name: "USB-C cable",
            description: "1m braided.",
            price: 7.99,
            quantity: 3,
            categoryId: "cat-tools",
          },
        ],
      },
      categories
    );
    expect(item).toMatchObject({
      valuation: 7.99,
      valueEstimated: false,
      vendor: "Amazon",
      categoryId: "cat-tools",
    });
    expect(item.purchasedOn?.toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(item.description).toContain("Bought 3 of these.");
  });
});

describe("amounts and dates", () => {
  it("accepts sensible amounts and rejects the rest", () => {
    expect(cleanAmount(12.345)).toBe(12.35);
    expect(cleanAmount("£1,200.50")).toBe(1200.5);
    expect(cleanAmount(-1)).toBeNull();
    expect(cleanAmount(NaN)).toBeNull();
    expect(cleanAmount(null)).toBeNull();
    expect(cleanAmount(1e12)).toBeNull();
  });
  it("accepts real, plausible dates only", () => {
    expect(cleanDate("2026-02-30")).toBeNull();
    expect(cleanDate("26-09-30")).toBeNull();
    expect(cleanDate("1980-01-01")).toBeNull();
    expect(cleanDate("2999-01-01")).toBeNull();
    expect(cleanDate("2026-09-30")?.toISOString().slice(0, 10)).toBe(
      "2026-09-30"
    );
  });
});

describe("description with purchase", () => {
  it("appends where and when once", () => {
    const d = new Date("2026-09-30T00:00:00.000Z");
    const once = descriptionWithPurchase("A cable.", "Amazon", d);
    expect(once).toBe("A cable. Bought from Amazon on 30/09/2026.");
    expect(descriptionWithPurchase(once, "Amazon", d)).toBe(once);
    expect(descriptionWithPurchase("A cable.", null, null)).toBe("A cable.");
  });
});
