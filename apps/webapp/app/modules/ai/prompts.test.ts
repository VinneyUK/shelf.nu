import { describe, expect, it } from "vitest";
import {
  cleanAmount,
  cleanDate,
  cleanPhotoResult,
  cleanReceiptResult,
  descriptionWithPurchase,
  PHOTO_TOOL,
  RECEIPT_TOOL,
  receiptSystemPrompt,
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
  it("asks for the price to buy it NEW, never the second-hand value", () => {
    const prompt = photoSystemPrompt("GBP");
    expect(prompt).toMatch(/NEW today/);
    expect(prompt).toMatch(/replacement value/);
    expect(prompt).toMatch(/closest current equivalent/);
    const toolText = JSON.stringify(PHOTO_TOOL);
    expect(toolText).toMatch(/buy this item NEW/);
    expect(toolText).not.toMatch(/second-hand market value/);
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

describe("catalogue-style descriptions", () => {
  it("asks for a product description of the item, then a paragraph on its surroundings", () => {
    const p = photoSystemPrompt("GBP");
    expect(p).toMatch(/catalogue entry/);
    expect(p).toMatch(/good product description/);
    expect(p).toMatch(/two paragraphs separated by a blank line/);
    expect(p).toMatch(/starting "In the photo:"/);
    expect(p).toMatch(/what is around it/);
    expect(p).toMatch(/key features and specifications/);
    expect(p).toMatch(/accessories or parts that are included/);
    expect(p).toMatch(/under 800 characters/);
    expect(p).toMatch(/don't put the price in it/);
  });
  it("won't have specifications made up", () => {
    const p = photoSystemPrompt("GBP");
    expect(p).toMatch(/Never invent details/);
    expect(p).toMatch(
      /only if it is visible or you are confident it belongs to that exact model/
    );
  });
  it("sets the same expectation in the tool the model fills in", () => {
    const tool = JSON.stringify(PHOTO_TOOL);
    expect(tool).toMatch(/catalogue entry in two paragraphs/);
    expect(tool).toMatch(/In the photo/);
    expect(tool).toMatch(/Under 800 characters/);
  });
  it("leaves receipts alone: there is no scene to describe", () => {
    expect(receiptSystemPrompt("GBP")).not.toMatch(/In the photo/);
    expect(JSON.stringify(RECEIPT_TOOL)).not.toMatch(/In the photo/);
    expect(JSON.stringify(RECEIPT_TOOL)).toMatch(/One to three sentences/);
  });
  it("lets the web research inform the features as well as the price", () => {
    const img = { type: "text", text: "(img)" } as const;
    const text = (
      photoContent(img, [], "GBP", "Item: keyboard")[1] as { text: string }
    ).text;
    expect(text).toMatch(
      /exact model, which you can use for the description's features/
    );
  });
});

describe("keeping the description's paragraphs", () => {
  const clean = (description: string) =>
    cleanPhotoResult(
      {
        items: [
          { name: "Thing", description, estimatedValue: 10, categoryId: null },
        ],
      },
      categories
    )[0].description;

  it("keeps the break between the item and its setting", () => {
    expect(
      clean("A 24-key MIDI keyboard.\n\nIn the photo: on a black desk mat.")
    ).toBe("A 24-key MIDI keyboard.\n\nIn the photo: on a black desk mat.");
  });
  it("tidies stray spacing, extra blank lines and empty paragraphs", () => {
    expect(
      clean("  A   keyboard.  \n\n\n\n  In the   photo: a desk.\n\n   \n")
    ).toBe("A keyboard.\n\nIn the photo: a desk.");
  });
  it("turns a single line break into a space, so a paragraph never splits mid-sentence", () => {
    expect(clean("A keyboard\nwith 24 keys.")).toBe("A keyboard with 24 keys.");
  });
  it("still stays within Shelf's limit", () => {
    const long = ("Sentence. ".repeat(60) + "\n\n").repeat(5);
    expect(clean(long).length).toBeLessThanOrEqual(1000);
  });
});
