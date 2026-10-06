/**
 * The drafts pipeline (fork), against a pretend database and a pretend Claude.
 */
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  draft: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  category: { findMany: vi.fn(), findFirst: vi.fn() },
  organization: { findUnique: vi.fn() },
  asset: { findUnique: vi.fn() },
  aiSettings: { updateMany: vi.fn() },
  getAiSettingsRow: vi.fn(),
  createAsset: vi.fn(),
  updateAssetMainImage: vi.fn(),
  storeAttachmentBytes: vi.fn(),
  assignEmailReceipt: vi.fn(),
  queueLabels: vi.fn(),
  addAssetActivity: vi.fn(),
}));

vi.mock("~/database/db.server", () => ({
  db: {
    assetDraft: mocks.draft,
    category: mocks.category,
    organization: mocks.organization,
    asset: mocks.asset,
    aiSettings: mocks.aiSettings,
  },
}));
vi.mock("./settings.server", () => ({
  getAiSettingsRow: mocks.getAiSettingsRow,
}));
vi.mock("~/modules/asset/service.server", () => ({
  createAsset: mocks.createAsset,
  updateAssetMainImage: mocks.updateAssetMainImage,
}));
vi.mock("~/modules/asset-attachment/service.server", () => ({
  storeAttachmentBytes: mocks.storeAttachmentBytes,
}));
vi.mock("~/modules/email-receipts/service.server", () => ({
  assignEmailReceipt: mocks.assignEmailReceipt,
}));
vi.mock("~/modules/labels/service.server", () => ({
  queueLabels: mocks.queueLabels,
}));
vi.mock("~/modules/activity/service.server", () => ({
  addAssetActivity: mocks.addAssetActivity,
}));

import { ClaudeError } from "./claude.server";
import {
  addDraftFiles,
  createAssetFromDraft,
  draftsSignature,
  processDraft,
  updateDraft,
} from "./drafts.server";

const categories = [{ id: "cat-audio", name: "Audio", description: null }];
const photo = async () =>
  new Uint8Array(
    await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#888" },
    })
      .png()
      .toBuffer()
  );

beforeEach(() => {
  for (const group of [
    mocks.draft,
    mocks.category,
    mocks.organization,
    mocks.asset,
    mocks.aiSettings,
  ])
    Object.values(group).forEach((f) => f.mockReset());
  for (const f of [
    mocks.getAiSettingsRow,
    mocks.createAsset,
    mocks.updateAssetMainImage,
    mocks.storeAttachmentBytes,
    mocks.assignEmailReceipt,
    mocks.queueLabels,
    mocks.addAssetActivity,
  ])
    f.mockReset();
  mocks.getAiSettingsRow.mockResolvedValue({
    enabled: true,
    apiKey: "sk-test",
    model: "claude-sonnet-5-5",
    workspaceId: "wrkspc_01ABC",
    draftReceipts: true,
    lastError: null,
  });
  mocks.category.findMany.mockResolvedValue(categories);
  mocks.organization.findUnique.mockResolvedValue({ currency: "GBP" });
  // the background pump finds nothing to do
  mocks.draft.findFirst.mockResolvedValue(null);
  mocks.draft.updateMany.mockResolvedValue({ count: 0 });
});

describe("adding files", () => {
  it("queues a good photo, shrunk to a JPEG", async () => {
    const r = await addDraftFiles({
      organizationId: "o1",
      userId: "u1",
      source: "photo",
      files: [{ name: "IMG_1.png", type: "image/png", bytes: await photo() }],
    });
    expect(r).toEqual({ queued: 1, failed: 0 });
    const data = mocks.draft.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: "pending",
      source: "photo",
      fileType: "image/jpeg",
      fileName: "IMG_1.jpg",
    });
  });
  it("keeps a bad file as a visible failed draft, not a silent loss", async () => {
    const r = await addDraftFiles({
      organizationId: "o1",
      userId: "u1",
      source: "photo",
      files: [
        { name: "notes.txt", type: "text/plain", bytes: new Uint8Array([1]) },
      ],
    });
    expect(r).toEqual({ queued: 0, failed: 1 });
    expect(mocks.draft.create.mock.calls[0][0].data).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/photo/),
    });
  });
  it("accepts a PDF only as a receipt", async () => {
    const pdf = {
      name: "r.pdf",
      type: "application/pdf",
      bytes: new Uint8Array([37, 80, 68, 70]),
    };
    expect(
      (
        await addDraftFiles({
          organizationId: "o1",
          userId: null,
          source: "receipt",
          files: [pdf],
        })
      ).queued
    ).toBe(1);
    expect(
      (
        await addDraftFiles({
          organizationId: "o1",
          userId: null,
          source: "photo",
          files: [pdf],
        })
      ).failed
    ).toBe(1);
  });
  it("refuses an empty batch", async () => {
    await expect(
      addDraftFiles({
        organizationId: "o1",
        userId: null,
        source: "photo",
        files: [],
      })
    ).rejects.toThrow(/at least one/);
  });
});

describe("reading a draft with Claude", () => {
  const working = {
    id: "d1",
    organizationId: "o1",
    status: "working",
    source: "photo",
    fileBytes: Buffer.from([1, 2]),
    fileType: "image/jpeg",
    fileName: "a.jpg",
    createdById: "u1",
    emailReceiptId: null,
    sourceText: null,
  };

  it("fills in the first item and makes extra drafts for the rest", async () => {
    mocks.draft.findUnique.mockResolvedValue(working);
    const call = vi.fn().mockResolvedValue({
      items: [
        {
          name: "Genelec 8040",
          description: "Monitor.",
          estimatedValue: 800,
          categoryId: "cat-audio",
        },
        {
          name: "Speaker stand",
          description: "Steel.",
          estimatedValue: 40,
          categoryId: null,
        },
      ],
    });
    await processDraft("d1", call);
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "wrkspc_01ABC",
        apiKey: "sk-test",
      })
    );
    expect(mocks.draft.update).toHaveBeenCalledWith({
      where: { id: "d1", organizationId: "o1" },
      data: expect.objectContaining({
        name: "Genelec 8040",
        valuation: 800,
        valueEstimated: true,
        categoryId: "cat-audio",
        status: "ready",
      }),
    });
    expect(mocks.draft.create).toHaveBeenCalledTimes(1);
    expect(mocks.draft.create.mock.calls[0][0].data).toMatchObject({
      name: "Speaker stand",
      status: "ready",
      organizationId: "o1",
    });
  });
  it("marks it failed, with the reason, when Claude finds nothing", async () => {
    mocks.draft.findUnique.mockResolvedValue(working);
    await processDraft("d1", vi.fn().mockResolvedValue({ items: [] }));
    expect(mocks.draft.update.mock.calls[0][0].data).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/couldn't pick out/),
    });
  });
  it("shows a rejected key on the draft and on the AI settings", async () => {
    mocks.draft.findUnique.mockResolvedValue(working);
    await processDraft(
      "d1",
      vi
        .fn()
        .mockRejectedValue(
          new ClaudeError("Anthropic rejected the API key.", 401)
        )
    );
    expect(mocks.draft.update.mock.calls[0][0].data).toMatchObject({
      status: "failed",
      error: "Anthropic rejected the API key.",
    });
    expect(mocks.aiSettings.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "o1" },
      data: { lastError: "Anthropic rejected the API key." },
    });
  });
  it("does nothing for a draft someone else already took", async () => {
    mocks.draft.findUnique.mockResolvedValue({ ...working, status: "ready" });
    const call = vi.fn();
    await processDraft("d1", call);
    expect(call).not.toHaveBeenCalled();
  });
  it("asks for AI to be switched on rather than failing mysteriously", async () => {
    mocks.draft.findUnique.mockResolvedValue(working);
    mocks.getAiSettingsRow.mockResolvedValue({
      enabled: false,
      apiKey: "",
      model: "m",
      draftReceipts: true,
      lastError: null,
    });
    await processDraft("d1", vi.fn());
    expect(mocks.draft.update.mock.calls[0][0].data.error).toMatch(
      /Settings → AI/
    );
  });
});

describe("approving a draft", () => {
  const ready = {
    id: "d1",
    organizationId: "o1",
    status: "creating",
    source: "photo",
    name: "Genelec 8040",
    description: "Monitor.",
    valuation: 800,
    categoryId: "cat-audio",
    purchasedOn: null,
    vendor: null,
    fileBytes: Buffer.from([1]),
    fileName: "a.jpg",
    emailReceiptId: null,
  };

  beforeEach(() => {
    mocks.draft.updateMany.mockResolvedValue({ count: 1 });
    mocks.draft.findUniqueOrThrow.mockResolvedValue(ready);
    mocks.createAsset.mockResolvedValue({ id: "a1" });
    mocks.asset.findUnique.mockResolvedValue({ sequentialId: "SAM-0020" });
  });

  it("creates the asset, attaches the photo, logs it, and clears the draft's file", async () => {
    const r = await createAssetFromDraft({
      organizationId: "o1",
      userId: "u1",
      draftId: "d1",
      printLabel: false,
    });
    expect(r).toEqual({
      assetId: "a1",
      sequentialId: "SAM-0020",
      warnings: [],
    });
    expect(mocks.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Genelec 8040",
        valuation: 800,
        categoryId: "cat-audio",
        organizationId: "o1",
        userId: "u1",
      })
    );
    expect(mocks.updateAssetMainImage).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: "a1", isNewAsset: true })
    );
    expect(mocks.addAssetActivity).toHaveBeenCalled();
    expect(mocks.draft.update).toHaveBeenCalledWith({
      where: { id: "d1", organizationId: "o1" },
      data: expect.objectContaining({
        status: "created",
        createdAssetId: "a1",
        fileBytes: null,
      }),
    });
    expect(mocks.queueLabels).not.toHaveBeenCalled();
  });
  it("queues a label when asked", async () => {
    await createAssetFromDraft({
      organizationId: "o1",
      userId: "u1",
      draftId: "d1",
      printLabel: true,
    });
    expect(mocks.queueLabels).toHaveBeenCalledWith(
      expect.objectContaining({ assetIds: ["a1"] })
    );
  });
  it("can't be made twice: a second claim finds nothing", async () => {
    mocks.draft.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      createAssetFromDraft({
        organizationId: "o1",
        userId: "u1",
        draftId: "d1",
        printLabel: false,
      })
    ).rejects.toThrow(/isn't ready/);
    expect(mocks.createAsset).not.toHaveBeenCalled();
  });
  it("keeps the asset and warns when the photo can't be saved", async () => {
    mocks.updateAssetMainImage.mockRejectedValue(new Error("storage down"));
    const r = await createAssetFromDraft({
      organizationId: "o1",
      userId: "u1",
      draftId: "d1",
      printLabel: false,
    });
    expect(r.assetId).toBe("a1");
    expect(r.warnings[0]).toMatch(/photo couldn't be saved/);
  });
  it("puts the draft back to ready when creating fails", async () => {
    mocks.createAsset.mockRejectedValue(new Error("db down"));
    await expect(
      createAssetFromDraft({
        organizationId: "o1",
        userId: "u1",
        draftId: "d1",
        printLabel: false,
      })
    ).rejects.toThrow("db down");
    expect(mocks.draft.updateMany).toHaveBeenLastCalledWith({
      where: { id: "d1", organizationId: "o1", status: "creating" },
      data: { status: "ready" },
    });
  });
  it("attaches an emailed receipt through Shelf's own assign, and falls back to the saved bytes", async () => {
    mocks.draft.findUniqueOrThrow.mockResolvedValue({
      ...ready,
      source: "receipt",
      emailReceiptId: "r1",
      fileName: "receipt.pdf",
    });
    mocks.assignEmailReceipt.mockResolvedValue("SAM-0020");
    await createAssetFromDraft({
      organizationId: "o1",
      userId: "u1",
      draftId: "d1",
      printLabel: false,
    });
    expect(mocks.assignEmailReceipt).toHaveBeenCalledWith(
      "o1",
      "r1",
      "SAM-0020"
    );
    expect(mocks.storeAttachmentBytes).not.toHaveBeenCalled();
    mocks.assignEmailReceipt.mockResolvedValue(null); // another item already took the receipt
    await createAssetFromDraft({
      organizationId: "o1",
      userId: "u1",
      draftId: "d1",
      printLabel: false,
    });
    expect(mocks.storeAttachmentBytes).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: "a1", originalName: "receipt.pdf" })
    );
  });
});

describe("editing a draft", () => {
  const base = {
    id: "d1",
    organizationId: "o1",
    status: "ready",
    valuation: 800,
    valueEstimated: true,
    error: null,
  };
  const edit = {
    name: "Genelec 8040A",
    description: "x",
    valuation: "800",
    categoryId: "",
    purchasedOn: "",
    vendor: "",
  };
  beforeEach(() => mocks.draft.findFirst.mockResolvedValue(base));

  it("keeps the estimate marker only while the value is untouched", async () => {
    await updateDraft("o1", "d1", edit);
    expect(mocks.draft.update.mock.calls[0][0].data.valueEstimated).toBe(true);
    await updateDraft("o1", "d1", { ...edit, valuation: "950" });
    expect(mocks.draft.update.mock.calls[1][0].data).toMatchObject({
      valuation: 950,
      valueEstimated: false,
    });
  });
  it("only accepts one of the person's own categories", async () => {
    mocks.category.findFirst.mockResolvedValue(null);
    await updateDraft("o1", "d1", { ...edit, categoryId: "not-mine" });
    expect(mocks.draft.update.mock.calls[0][0].data.categoryId).toBeNull();
  });
  it("makes a failed draft ready once it has a name, and leaves it failed without one", async () => {
    mocks.draft.findFirst.mockResolvedValue({
      ...base,
      status: "failed",
      error: "nope",
    });
    await updateDraft("o1", "d1", edit);
    expect(mocks.draft.update.mock.calls[0][0].data).toMatchObject({
      status: "ready",
      error: null,
    });
    await updateDraft("o1", "d1", { ...edit, name: "  " });
    expect(mocks.draft.update.mock.calls[1][0].data).toMatchObject({
      status: "failed",
      error: "nope",
    });
  });
  it("won't edit a draft that's already been made", async () => {
    mocks.draft.findFirst.mockResolvedValue(null);
    await expect(updateDraft("o1", "d1", edit)).rejects.toThrow(
      /can't be edited/
    );
  });
});

describe("looking the price up on the web first", () => {
  const working = {
    id: "d1",
    organizationId: "o1",
    status: "working",
    source: "photo",
    fileBytes: Buffer.from([1, 2]),
    fileType: "image/jpeg",
    fileName: "a.jpg",
    createdById: "u1",
    emailReceiptId: null,
    sourceText: null,
  };
  const items = {
    items: [
      {
        name: "ROLI LUMI Keys",
        description: "Keyboard.",
        estimatedValue: 150,
        categoryId: null,
        notes: "Based on UK listings.",
      },
    ],
  };
  const on = () =>
    mocks.getAiSettingsRow.mockResolvedValue({
      enabled: true,
      apiKey: "sk-test",
      model: "claude-sonnet-5-5",
      workspaceId: "",
      webSearch: true,
      draftReceipts: true,
      lastError: null,
    });
  const textOf = (call: ReturnType<typeof vi.fn>) =>
    (call.mock.calls[0][0].content as { type: string; text?: string }[])
      .map((b) => b.text ?? "")
      .join("\n");

  beforeEach(() => mocks.draft.findUnique.mockResolvedValue(working));

  it("researches first, then drafts with what it found in hand", async () => {
    on();
    const research = vi.fn().mockResolvedValue({
      text: "Item: ROLI Piano M\nNew price (GBP): 150",
      searches: 2,
      error: null,
    });
    const call = vi.fn().mockResolvedValue(items);
    await processDraft("d1", call, research);
    expect(research).toHaveBeenCalledTimes(1);
    expect(research.mock.calls[0][0].system).toMatch(/costs NEW today/);
    expect(research.mock.calls[0][0].apiKey).toBe("sk-test");
    expect(textOf(call)).toMatch(/Price research from a web search/);
    expect(textOf(call)).toMatch(/New price \(GBP\): 150/);
    expect(mocks.draft.update.mock.calls[0][0].data).toMatchObject({
      name: "ROLI LUMI Keys",
      status: "ready",
      valuation: 150,
      valueEstimated: true,
    });
    expect(mocks.draft.update.mock.calls[0][0].data.notes).not.toMatch(
      /No web price lookup/
    );
  });
  it("makes no lookup when it's switched off", async () => {
    const research = vi.fn();
    const call = vi.fn().mockResolvedValue(items);
    await processDraft("d1", call, research);
    expect(research).not.toHaveBeenCalled();
    expect(textOf(call)).not.toMatch(/Price research/);
  });
  it("never lets a failed lookup stop the draft: it carries on from memory and says so", async () => {
    on();
    const research = vi.fn().mockResolvedValue({
      text: null,
      searches: 0,
      error: "Web search isn't switched on for this Anthropic account.",
    });
    const call = vi.fn().mockResolvedValue(items);
    await processDraft("d1", call, research);
    expect(call).toHaveBeenCalledTimes(1);
    expect(textOf(call)).not.toMatch(/Price research/);
    const data = mocks.draft.update.mock.calls[0][0].data;
    expect(data.status).toBe("ready");
    expect(data.notes).toMatch(
      /No web price lookup: Web search isn't switched on/
    );
    // and the AI settings page shows the problem
    expect(mocks.aiSettings.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "o1" },
      data: {
        lastError: "Web search isn't switched on for this Anthropic account.",
      },
    });
  });
  it("uses a partial answer and keeps its warning", async () => {
    on();
    const research = vi.fn().mockResolvedValue({
      text: "Item: keyboard\nNew price (GBP): 140",
      searches: 1,
      error: "Anthropic's web search is rate-limited right now.",
    });
    const call = vi.fn().mockResolvedValue(items);
    await processDraft("d1", call, research);
    expect(textOf(call)).toMatch(/140/);
    expect(mocks.draft.update.mock.calls[0][0].data.notes).toMatch(
      /rate-limited/
    );
    expect(mocks.aiSettings.updateMany).not.toHaveBeenCalled(); // an answer was found: not a settings problem
  });
  it("keeps the notes within their limit", async () => {
    on();
    const research = vi
      .fn()
      .mockResolvedValue({ text: null, searches: 0, error: "x".repeat(400) });
    const call = vi.fn().mockResolvedValue({
      items: [
        {
          name: "Thing",
          description: "",
          estimatedValue: 1,
          categoryId: null,
          notes: "n".repeat(250),
        },
      ],
    });
    await processDraft("d1", call, research);
    expect(
      mocks.draft.update.mock.calls[0][0].data.notes.length
    ).toBeLessThanOrEqual(300);
  });
  it("is used for photos only, never receipts", async () => {
    on();
    mocks.draft.findUnique.mockResolvedValue({
      ...working,
      source: "receipt",
      fileType: "application/pdf",
      fileName: "r.pdf",
    });
    const research = vi.fn();
    const call = vi.fn().mockResolvedValue({
      vendor: "Amazon",
      purchaseDate: null,
      items: [
        {
          name: "Cable",
          description: "",
          price: 5,
          quantity: 1,
          categoryId: null,
        },
      ],
    });
    await processDraft("d1", call, research);
    expect(research).not.toHaveBeenCalled();
  });
});

describe("the description length in a photo draft", () => {
  const working = {
    id: "d1",
    organizationId: "o1",
    status: "working",
    source: "photo",
    fileBytes: Buffer.from([1, 2]),
    fileType: "image/jpeg",
    fileName: "a.jpg",
    createdById: "u1",
    emailReceiptId: null,
    sourceText: null,
  };
  const long = "It is a black keyboard with twenty four keys. ".repeat(20);
  const settings = (extra: Record<string, unknown>) =>
    mocks.getAiSettingsRow.mockResolvedValue({
      enabled: true,
      apiKey: "sk-test",
      model: "claude-sonnet-5-5",
      workspaceId: "",
      webSearch: false,
      draftReceipts: true,
      lastError: null,
      ...extra,
    });
  beforeEach(() => mocks.draft.findUnique.mockResolvedValue(working));

  it("tells Claude the length, in both the instructions and the tool it fills in", async () => {
    settings({ descriptionLength: 150 });
    const call = vi.fn().mockResolvedValue({
      items: [
        {
          name: "Keyboard",
          description: "Short.",
          estimatedValue: 1,
          categoryId: null,
        },
      ],
    });
    await processDraft("d1", call);
    expect(call.mock.calls[0][0].system).toMatch(/under 150 characters/);
    expect(JSON.stringify(call.mock.calls[0][0].tool)).toMatch(
      /Under 150 characters/
    );
  });
  it("trims what comes back to the chosen length, even if Claude goes over", async () => {
    settings({ descriptionLength: 150 });
    const call = vi.fn().mockResolvedValue({
      items: [
        {
          name: "Keyboard",
          description: long,
          estimatedValue: 1,
          categoryId: null,
        },
      ],
    });
    await processDraft("d1", call);
    const saved = mocks.draft.update.mock.calls[0][0].data
      .description as string;
    expect(saved.length).toBeLessThanOrEqual(150);
    expect(saved.endsWith(".")).toBe(true);
  });
  it("is 300 when nothing has been set", async () => {
    settings({});
    const call = vi.fn().mockResolvedValue({
      items: [
        {
          name: "Keyboard",
          description: long,
          estimatedValue: 1,
          categoryId: null,
        },
      ],
    });
    await processDraft("d1", call);
    expect(call.mock.calls[0][0].system).toMatch(/under 300 characters/);
    expect(
      (mocks.draft.update.mock.calls[0][0].data.description as string).length
    ).toBeLessThanOrEqual(300);
  });
  it("trims a receipt's description to the same length", async () => {
    settings({ descriptionLength: 150 });
    mocks.draft.findUnique.mockResolvedValue({
      ...working,
      source: "receipt",
      fileType: "application/pdf",
      fileName: "r.pdf",
    });
    const call = vi.fn().mockResolvedValue({
      vendor: "Amazon",
      purchaseDate: null,
      items: [
        {
          name: "Cable",
          description: long,
          price: 5,
          quantity: 1,
          categoryId: null,
        },
      ],
    });
    await processDraft("d1", call);
    expect(
      (mocks.draft.update.mock.calls[0][0].data.description as string).length
    ).toBeLessThanOrEqual(150);
  });
});

describe("the drafts fingerprint the page polls", () => {
  const g = (status: string, n: number, at: number) => ({
    status,
    _count: { _all: n },
    _max: { updatedAt: new Date(at) },
  });

  it("counts what's still being read: pending and working, not ready or failed", () => {
    expect(
      draftsSignature([
        g("pending", 2, 1),
        g("working", 1, 2),
        g("ready", 4, 3),
        g("failed", 1, 4),
      ]).pending
    ).toBe(3);
    expect(draftsSignature([g("ready", 4, 3)]).pending).toBe(0);
    expect(draftsSignature([]).pending).toBe(0);
  });
  it("changes when a draft is added, finishes, fails, or is edited", () => {
    const before = draftsSignature([
      g("pending", 2, 1000),
      g("ready", 1, 500),
    ]).signature;
    // one finishes reading
    expect(
      draftsSignature([g("pending", 1, 2000), g("ready", 2, 2000)]).signature
    ).not.toBe(before);
    // one is edited (its time moves on, the counts don't)
    expect(
      draftsSignature([g("pending", 2, 1000), g("ready", 1, 9999)]).signature
    ).not.toBe(before);
    // one more is added
    expect(
      draftsSignature([g("pending", 3, 3000), g("ready", 1, 500)]).signature
    ).not.toBe(before);
  });
  it("doesn't change when nothing has: the same drafts give the same fingerprint, in any order", () => {
    const a = draftsSignature([
      g("ready", 1, 500),
      g("pending", 2, 1000),
    ]).signature;
    const b = draftsSignature([
      g("pending", 2, 1000),
      g("ready", 1, 500),
    ]).signature;
    expect(a).toBe(b);
  });
  it("copes with a group that has no time", () => {
    expect(() =>
      draftsSignature([
        { status: "ready", _count: { _all: 1 }, _max: { updatedAt: null } },
      ])
    ).not.toThrow();
  });
});
