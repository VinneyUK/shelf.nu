import { describe, expect, it } from "vitest";
import {
  cleanAmount,
  cleanDate,
  cleanPhotoResult,
  cleanReceiptResult,
  descriptionGuide,
  fitDescription,
  photoTool,
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

describe("the description guide", () => {
  it("asks for a short product description of the item only, never its surroundings", () => {
    const guide = descriptionGuide(300);
    expect(guide).toMatch(/short product description/);
    expect(guide).toMatch(/brand and model if identifiable/);
    expect(guide).toMatch(/key features/);
    expect(guide).toMatch(/Describe the item only: not its surroundings/);
    expect(guide).toMatch(/Don't put the price in it/);
    expect(guide).not.toMatch(/In the photo/);
    expect(photoSystemPrompt("GBP")).not.toMatch(/In the photo/);
    expect(JSON.stringify(PHOTO_TOOL)).not.toMatch(/In the photo/);
  });
  it("scales the wording to the length asked for", () => {
    expect(descriptionGuide(150)).toMatch(
      /one or two short sentences, and under 150 characters/
    );
    expect(descriptionGuide(300)).toMatch(
      /two or three sentences, and under 300 characters/
    );
    expect(descriptionGuide(500)).toMatch(
      /three or four sentences, and under 500 characters/
    );
    expect(descriptionGuide(800)).toMatch(
      /a short paragraph, and under 800 characters/
    );
  });
  it("puts the chosen length in the system prompt and in the tool the model fills in", () => {
    expect(photoSystemPrompt("GBP", 150)).toMatch(/under 150 characters/);
    expect(JSON.stringify(photoTool(150))).toMatch(/Under 150 characters/);
    // short by default: 300
    expect(photoSystemPrompt("GBP")).toMatch(/under 300 characters/);
    expect(JSON.stringify(PHOTO_TOOL)).toMatch(/Under 300 characters/);
  });
  it("leaves receipts alone: they are not asked for a product description", () => {
    expect(receiptSystemPrompt("GBP")).not.toMatch(/product description/);
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

describe("fitting a description to its length", () => {
  const sentences =
    "The case is black. It has 24 keys. It connects over USB. It is lightly used.";

  it("leaves a description that already fits", () => {
    expect(fitDescription("A short one.", 300)).toBe("A short one.");
    expect(fitDescription("  padded  ", 300)).toBe("padded");
    expect(fitDescription("x".repeat(50), 50)).toBe("x".repeat(50)); // exactly the limit
  });
  it("cuts at the end of a whole sentence", () => {
    expect(fitDescription(sentences, 45)).toBe(
      "The case is black. It has 24 keys."
    );
    expect(fitDescription(sentences, 60)).toBe(
      "The case is black. It has 24 keys. It connects over USB."
    );
  });
  it("cuts at a word, with an ellipsis, when no sentence keeps at least half", () => {
    const out = fitDescription(
      "A very long opening sentence that runs well past the limit without stopping",
      40
    );
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out).not.toMatch(/\s…$/);
  });
  it("never exceeds the limit, even for a single huge word", () => {
    expect(fitDescription("x".repeat(500), 100).length).toBeLessThanOrEqual(
      100
    );
    for (const max of [100, 150, 300, 600]) {
      expect(
        fitDescription(sentences.repeat(20), max).length
      ).toBeLessThanOrEqual(max);
    }
  });
  it("doesn't mistake a decimal point or a model number for the end of a sentence", () => {
    const out = fitDescription(
      "Runs on USB 3.2 at up to 5.5 Gbps and weighs 1.2 kg in total, with a braided cable included in the box",
      60
    );
    expect(out).not.toMatch(/\d\.$/);
  });
});

describe("the description length in the results", () => {
  const long = "Sentence number one is here. ".repeat(40);
  const photo = (max?: number) =>
    cleanPhotoResult(
      {
        items: [
          {
            name: "Thing",
            description: long,
            estimatedValue: 10,
            categoryId: null,
          },
        ],
      },
      categories,
      max
    )[0].description;

  it("trims a photo's description to the chosen length, ending on a sentence", () => {
    const out = photo(150);
    expect(out.length).toBeLessThanOrEqual(150);
    expect(out.endsWith(".")).toBe(true);
  });
  it("is 300 by default", () => {
    expect(photo().length).toBeLessThanOrEqual(300);
    expect(photo().length).toBeGreaterThan(150);
  });
  it("can be longer when asked", () => {
    expect(photo(900).length).toBeGreaterThan(300);
    expect(photo(900).length).toBeLessThanOrEqual(900);
  });
  it("applies to receipts too", () => {
    const [item] = cleanReceiptResult(
      {
        items: [
          {
            name: "Cable",
            description: long,
            price: 5,
            quantity: 1,
            categoryId: null,
          },
        ],
      },
      categories,
      150
    );
    expect(item.description.length).toBeLessThanOrEqual(150);
  });
  it("keeps a paragraph break if the model writes one, and tidies spacing", () => {
    const [item] = cleanPhotoResult(
      {
        items: [
          {
            name: "Thing",
            description: "  A   keyboard.  \n\n\n\n  Boxed.\n\n   \n",
            estimatedValue: 1,
            categoryId: null,
          },
        ],
      },
      categories
    );
    expect(item.description).toBe("A keyboard.\n\nBoxed.");
  });
  it("turns a single line break into a space, so a sentence never splits", () => {
    const [item] = cleanPhotoResult(
      {
        items: [
          {
            name: "Thing",
            description: "A keyboard\nwith 24 keys.",
            estimatedValue: 1,
            categoryId: null,
          },
        ],
      },
      categories
    );
    expect(item.description).toBe("A keyboard with 24 keys.");
  });
});
