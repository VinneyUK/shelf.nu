/**
 * Drafts (fork): photos and receipts become proposed assets. Claude reads each
 * one in the background; nothing becomes an asset until the person approves it.
 *
 * Part of the AI feature; not in upstream Shelf.
 */
import sharp from "sharp";
import { db } from "~/database/db.server";
import { addAssetActivity } from "~/modules/activity/service.server";
import {
  createAsset,
  updateAssetMainImage,
} from "~/modules/asset/service.server";
import { storeAttachmentBytes } from "~/modules/asset-attachment/service.server";
import { assignEmailReceipt } from "~/modules/email-receipts/service.server";
import { queueLabels } from "~/modules/labels/service.server";
import { ShelfError } from "~/utils/error";
import {
  callClaude,
  ClaudeError,
  imageBlock,
  pdfBlock,
  type ContentBlock,
} from "./claude.server";
import { DESCRIPTION_LENGTH } from "./models";
import { researchPrice } from "./price-research.server";
import {
  type CategoryOption,
  cleanDate,
  cleanPhotoResult,
  cleanReceiptResult,
  descriptionWithPurchase,
  type DraftFields,
  photoTool,
  photoContent,
  photoSystemPrompt,
  priceResearchContent,
  priceResearchSystemPrompt,
  RECEIPT_TOOL,
  receiptContent,
  receiptSystemPrompt,
} from "./prompts";
import { getAiSettingsRow } from "./settings.server";

export type DraftSource = "photo" | "receipt";
const label = "Assets" as const;

const MAX_CONCURRENT = 3;
const STALE_WORKING_MS = 5 * 60_000;
/** The longest edge Claude is sent. Receipts keep more, so small print stays legible. */
const PHOTO_EDGE = 1568;
const RECEIPT_EDGE = 2200;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const bad = (message: string, status: 400 | 404 = 400) =>
  new ShelfError({
    cause: null,
    message,
    status,
    label,
    shouldBeCaptured: false,
  });

// ------------------------------------------------------------------- intake

export type IncomingFile = { name: string; type: string; bytes: Uint8Array };

const isPdf = (f: IncomingFile) =>
  f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const isImage = (f: IncomingFile) =>
  f.type.startsWith("image/") ||
  /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);

/** JPEG, upright, within the edge limit: what Claude reads and what becomes the asset's photo. */
export async function normaliseImage(bytes: Uint8Array, edge: number) {
  const out = await sharp(Buffer.from(bytes))
    .rotate()
    .resize({
      width: edge,
      height: edge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { bytes: new Uint8Array(out), type: "image/jpeg" };
}

type Prepared =
  | { fileName: string; fileType: string; fileBytes: Uint8Array<ArrayBuffer> }
  | { error: string; fileName: string };

async function prepare(
  source: DraftSource,
  file: IncomingFile
): Promise<Prepared> {
  if (file.bytes.byteLength === 0)
    return { fileName: file.name, error: "That file is empty." };
  if (file.bytes.byteLength > MAX_FILE_BYTES)
    return { fileName: file.name, error: "That file is larger than 25 MB." };
  if (source === "receipt" && isPdf(file)) {
    return {
      fileName: file.name,
      fileType: "application/pdf",
      fileBytes: new Uint8Array(file.bytes),
    };
  }
  if (isImage(file)) {
    try {
      const n = await normaliseImage(
        file.bytes,
        source === "photo" ? PHOTO_EDGE : RECEIPT_EDGE
      );
      const name = file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
      return { fileName: name, fileType: n.type, fileBytes: n.bytes };
    } catch {
      return {
        fileName: file.name,
        error:
          "That photo couldn't be read. If it's a HEIC from an iPhone, export it as a JPEG and try again.",
      };
    }
  }
  return {
    fileName: file.name,
    error:
      source === "receipt"
        ? "Send a PDF or a photo of the receipt."
        : "Send a photo (JPEG, PNG or WebP).",
  };
}

/** Queues one draft per file. A file that can't be used still gets a draft, marked failed, so it's not silently lost. */
export async function addDraftFiles({
  organizationId,
  userId,
  source,
  files,
}: {
  organizationId: string;
  userId: string | null;
  source: DraftSource;
  files: IncomingFile[];
}) {
  if (files.length === 0) throw bad("Choose at least one file.");
  if (files.length > 40) throw bad("Add up to 40 files at a time.");
  let queued = 0;
  let failed = 0;
  for (const file of files) {
    const p = await prepare(source, file);
    if ("error" in p) {
      failed += 1;
      await db.assetDraft.create({
        data: {
          organizationId,
          createdById: userId,
          source,
          status: "failed",
          error: p.error,
          fileName: p.fileName,
        },
      });
    } else {
      queued += 1;
      await db.assetDraft.create({
        data: {
          organizationId,
          createdById: userId,
          source,
          status: "pending",
          ...p,
        },
      });
    }
  }
  if (queued > 0) kickDraftProcessing();
  return { queued, failed };
}

/** An emailed receipt naming no asset: one draft per receipt file (or for the text itself). */
export async function draftsFromEmailedReceipt({
  organizationId,
  emailReceiptId,
  subject,
  text,
  files,
}: {
  organizationId: string;
  emailReceiptId: string;
  subject: string;
  text: string | null;
  files: IncomingFile[];
}): Promise<boolean> {
  const ai = await getAiSettingsRow(organizationId);
  if (!ai.enabled || !ai.apiKey || !ai.draftReceipts) return false;
  const body = [subject ? `Subject: ${subject}` : "", text?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n");
  const pick = files.find(isPdf) ?? files.find(isImage);
  if (!pick && body.length < 40) return false;
  const prepared = pick ? await prepare("receipt", pick) : null;
  await db.assetDraft.create({
    data: {
      organizationId,
      source: "receipt",
      status: "pending",
      emailReceiptId,
      sourceText: body || null,
      ...(prepared && !("error" in prepared) ? prepared : {}),
    },
  });
  kickDraftProcessing();
  return true;
}

// --------------------------------------------------------------- processing

let pumping = false;
let active = 0;

/** Starts reading any pending drafts, a few at a time. Safe to call as often as you like. */
export function kickDraftProcessing() {
  void pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    // A server restart can strand a draft mid-read; hand those back
    await db.assetDraft.updateMany({
      where: {
        status: "working",
        updatedAt: { lt: new Date(Date.now() - STALE_WORKING_MS) },
      },
      data: { status: "pending" },
    });
    while (active < MAX_CONCURRENT) {
      const next = await db.assetDraft.findFirst({
        where: { status: "pending" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!next) break;
      // eslint-disable-next-line local-rules/require-org-scope-on-id-queries -- idor-safe: background queue; drafts of every workspace are worked in turn, and the row carries its own organizationId
      const { count } = await db.assetDraft.updateMany({
        // eslint-disable-next-line local-rules/require-org-scope-on-id-queries -- idor-safe: background queue; drafts of every workspace are worked in turn, and the row carries its own organizationId
        where: { id: next.id, status: "pending" },
        data: { status: "working" },
      });
      if (count === 0) continue;
      active += 1;
      void processDraft(next.id).finally(() => {
        active -= 1;
        void pump();
      });
    }
  } finally {
    pumping = false;
  }
}

const fail = (id: string, organizationId: string, message: string) =>
  db.assetDraft.update({
    where: { id, organizationId },
    // the email text stays, so a failed receipt can be read again
    data: { status: "failed", error: message },
  });

/** Reads one draft with Claude and fills it in (extra items on the same photo or receipt become extra drafts). */
export async function processDraft(
  id: string,
  call: typeof callClaude = callClaude,
  research: typeof researchPrice = researchPrice
) {
  // eslint-disable-next-line local-rules/require-org-scope-on-id-queries -- idor-safe: background worker; the id comes from the queue, and every later query uses the row's own organizationId
  const draft = await db.assetDraft.findUnique({ where: { id } });
  if (!draft || draft.status !== "working") return;
  try {
    const ai = await getAiSettingsRow(draft.organizationId);
    if (!ai.enabled || !ai.apiKey) {
      await fail(
        id,
        draft.organizationId,
        "AI isn't switched on. Turn it on and add a key in Settings → AI, then retry."
      );
      return;
    }
    const [categories, org] = await Promise.all([
      db.category.findMany({
        where: { organizationId: draft.organizationId },
        select: { id: true, name: true, description: true },
        orderBy: { name: "asc" },
      }),
      db.organization.findUnique({
        where: { id: draft.organizationId },
        select: { currency: true },
      }),
    ]);
    const currency = org?.currency ?? "GBP";
    // how long a description may be: the person's setting (Settings → AI)
    const maxChars = ai.descriptionLength ?? DESCRIPTION_LENGTH.default;
    const bytes = draft.fileBytes ? new Uint8Array(draft.fileBytes) : null;

    let items: DraftFields[];
    if (draft.source === "photo") {
      if (!bytes) throw bad("There's no photo to read.");
      const image = imageBlock(bytes, draft.fileType ?? "image/jpeg");

      // fork: look the new price up on the web first, if that's switched on.
      // A lookup that fails never stops the draft: it carries on from the
      // model's own knowledge, and says so in the notes.
      let lookup: Awaited<ReturnType<typeof researchPrice>> | null = null;
      if (ai.webSearch) {
        lookup = await research({
          apiKey: ai.apiKey,
          model: ai.model,
          workspaceId: ai.workspaceId,
          system: priceResearchSystemPrompt(currency),
          content: priceResearchContent(image),
        });
        if (lookup.error && !lookup.text) {
          await db.aiSettings.updateMany({
            where: { organizationId: draft.organizationId },
            data: { lastError: lookup.error },
          });
        }
      }

      const result = await call({
        apiKey: ai.apiKey,
        model: ai.model,
        workspaceId: ai.workspaceId,
        system: photoSystemPrompt(currency, maxChars),
        content: photoContent(
          image,
          categories as CategoryOption[],
          currency,
          lookup?.text
        ),
        tool: photoTool(maxChars),
      });
      items = cleanPhotoResult(result, categories, maxChars);
      if (lookup?.error) {
        const warning = `No web price lookup: ${lookup.error}`;
        items = items.map((item) => ({
          ...item,
          notes: [item.notes, warning].filter(Boolean).join(" ").slice(0, 300),
        }));
      }
    } else {
      const blocks: ContentBlock[] = bytes
        ? [
            draft.fileType === "application/pdf"
              ? pdfBlock(bytes)
              : imageBlock(bytes, draft.fileType ?? "image/jpeg"),
          ]
        : [];
      const result = await call({
        apiKey: ai.apiKey,
        model: ai.model,
        workspaceId: ai.workspaceId,
        system: receiptSystemPrompt(currency),
        content: receiptContent(
          { blocks, emailText: draft.sourceText },
          categories as CategoryOption[],
          currency
        ),
        tool: RECEIPT_TOOL,
        maxTokens: 6000,
      });
      items = cleanReceiptResult(result, categories, maxChars);
    }

    if (items.length === 0) {
      await fail(
        id,
        draft.organizationId,
        draft.source === "photo"
          ? "Claude couldn't pick out an item in that photo. You can fill it in by hand, or retry with a clearer photo."
          : "Claude found nothing to add on that receipt (it skips delivery, fees and consumables). You can fill one in by hand."
      );
      return;
    }
    const [first, ...rest] = items;
    await db.assetDraft.update({
      where: { id, organizationId: draft.organizationId },
      data: { ...first, status: "ready", error: null, sourceText: null },
    });
    for (const item of rest) {
      await db.assetDraft.create({
        data: {
          ...item,
          organizationId: draft.organizationId,
          createdById: draft.createdById,
          source: draft.source,
          status: "ready",
          emailReceiptId: draft.emailReceiptId,
          fileName: draft.fileName,
          fileType: draft.fileType,
          fileBytes: draft.fileBytes ?? undefined,
        },
      });
    }
  } catch (cause) {
    const message =
      cause instanceof ClaudeError || cause instanceof ShelfError
        ? cause.message
        : "Something went wrong reading that.";
    await fail(id, draft.organizationId, message);
    if (
      cause instanceof ClaudeError &&
      (cause.status === 401 || cause.status === 403 || cause.status === 404)
    ) {
      await db.aiSettings.updateMany({
        where: { organizationId: draft.organizationId },
        data: { lastError: message },
      });
    }
  }
}

// ------------------------------------------------------------------ the list

const listSelect = {
  id: true,
  source: true,
  status: true,
  name: true,
  description: true,
  valuation: true,
  valueEstimated: true,
  categoryId: true,
  purchasedOn: true,
  vendor: true,
  notes: true,
  error: true,
  fileName: true,
  fileType: true,
  emailReceiptId: true,
  createdAt: true,
} as const;

/** Open drafts, oldest first, without the file bytes. */
export async function listDrafts(organizationId: string) {
  const drafts = await db.assetDraft.findMany({
    where: {
      organizationId,
      status: { in: ["pending", "working", "ready", "failed", "creating"] },
    },
    orderBy: { createdAt: "asc" },
    select: listSelect,
  });
  // `hasFile` lets the page show the photo without sending the bytes
  const withFiles = await db.assetDraft.findMany({
    where: {
      organizationId,
      id: { in: drafts.map((d) => d.id) },
      fileBytes: { not: null },
    },
    select: { id: true },
  });
  const has = new Set(withFiles.map((d) => d.id));
  return drafts.map((d) => ({ ...d, hasFile: has.has(d.id) }));
}

export async function countOpenDrafts(organizationId: string) {
  return db.assetDraft.count({
    where: { organizationId, status: { in: ["ready", "failed"] } },
  });
}

export async function hasPendingDrafts(organizationId: string) {
  return (
    (await db.assetDraft.count({
      where: { organizationId, status: { in: ["pending", "working"] } },
    })) > 0
  );
}

export async function getDraftFile(organizationId: string, id: string) {
  const d = await db.assetDraft.findFirst({
    where: { id, organizationId },
    select: { fileBytes: true, fileType: true, fileName: true },
  });
  return d?.fileBytes
    ? {
        bytes: new Uint8Array(d.fileBytes),
        type: d.fileType ?? "application/octet-stream",
        name: d.fileName ?? "file",
      }
    : null;
}

// ------------------------------------------------------------------ editing

export type DraftEdit = {
  name: string;
  description: string;
  valuation: string;
  categoryId: string;
  purchasedOn: string;
  vendor: string;
};

/** Saves the person's edits. Changing the value means it's theirs now, not an estimate. */
export async function updateDraft(
  organizationId: string,
  id: string,
  edit: DraftEdit
) {
  const draft = await db.assetDraft.findFirst({
    where: { id, organizationId, status: { in: ["ready", "failed"] } },
  });
  if (!draft) throw bad("That draft can't be edited any more.", 404);
  const name = edit.name.replace(/\s+/g, " ").trim().slice(0, 120);
  const valueText = edit.valuation.replace(/[^0-9.]/g, "");
  const valuation =
    valueText === "" ? null : Math.round(Number(valueText) * 100) / 100;
  if (valuation !== null && !Number.isFinite(valuation))
    throw bad("Enter the value as a number.");
  const categoryId = edit.categoryId
    ? (
        await db.category.findFirst({
          where: { id: edit.categoryId, organizationId },
          select: { id: true },
        })
      )?.id ?? null
    : null;
  const purchasedOn = edit.purchasedOn ? cleanDate(edit.purchasedOn) : null;
  await db.assetDraft.update({
    where: { id, organizationId },
    data: {
      name,
      description: edit.description.trim().slice(0, 1000),
      valuation,
      valueEstimated: draft.valueEstimated && valuation === draft.valuation,
      categoryId,
      purchasedOn,
      vendor: edit.vendor.trim().slice(0, 80) || null,
      // Filling in a failed draft by hand makes it ready to create
      status: name ? "ready" : draft.status,
      error: name ? null : draft.error,
    },
  });
}

export async function discardDrafts(organizationId: string, ids: string[]) {
  const { count } = await db.assetDraft.updateMany({
    where: {
      organizationId,
      id: { in: ids },
      status: { in: ["ready", "failed", "pending"] },
    },
    data: { status: "discarded", fileBytes: null, sourceText: null },
  });
  return count;
}

/** Reads a failed draft again (and picks up the current key and model). */
export async function retryDraft(organizationId: string, id: string) {
  const { count } = await db.assetDraft.updateMany({
    where: {
      id,
      organizationId,
      status: "failed",
      OR: [{ fileBytes: { not: null } }, { sourceText: { not: null } }],
    },
    data: { status: "pending", error: null },
  });
  if (count === 0)
    throw bad(
      "That one can't be read again: there's no file saved with it. Add it again, or fill it in by hand."
    );
  kickDraftProcessing();
}

// ---------------------------------------------------------------- approving

/** Attaches the draft's photo as the asset's main image, through Shelf's own image pipeline. */
async function attachPhoto({
  bytes,
  assetId,
  userId,
  organizationId,
}: {
  bytes: Uint8Array;
  assetId: string;
  userId: string;
  organizationId: string;
}) {
  const form = new FormData();
  form.set(
    "mainImage",
    new File([Buffer.from(bytes)], "photo.jpg", { type: "image/jpeg" })
  );
  const request = new Request("http://localhost/internal/draft-photo", {
    method: "POST",
    body: form,
  });
  await updateAssetMainImage({
    request,
    assetId,
    userId,
    organizationId,
    isNewAsset: true,
  });
}

/**
 * Makes the asset from a draft. Claimed first, so two clicks (or two tabs) can't
 * make it twice; put back to ready if anything fails. A photo or receipt that
 * can't be attached doesn't undo the asset: it's reported as a warning.
 */
export async function createAssetFromDraft({
  organizationId,
  userId,
  draftId,
  printLabel,
}: {
  organizationId: string;
  userId: string;
  draftId: string;
  printLabel: boolean;
}): Promise<{
  assetId: string;
  sequentialId: string | null;
  warnings: string[];
}> {
  const claim = await db.assetDraft.updateMany({
    where: {
      id: draftId,
      organizationId,
      status: { in: ["ready", "failed"] },
      NOT: { name: "" },
    },
    data: { status: "creating" },
  });
  if (claim.count === 0)
    throw bad(
      "That draft isn't ready to create (it needs a name, and may already be made)."
    );
  const draft = await db.assetDraft.findUniqueOrThrow({
    where: { id: draftId, organizationId },
  });
  const warnings: string[] = [];
  try {
    const asset = await createAsset({
      title: draft.name,
      description: descriptionWithPurchase(
        draft.description,
        draft.vendor,
        draft.purchasedOn
      ),
      userId,
      organizationId,
      categoryId: draft.categoryId,
      valuation: draft.valuation,
    });
    const created = await db.asset.findUnique({
      where: { id: asset.id, organizationId },
      select: { sequentialId: true },
    });
    const sequentialId = created?.sequentialId ?? null;
    const bytes = draft.fileBytes ? new Uint8Array(draft.fileBytes) : null;

    if (draft.source === "photo" && bytes) {
      try {
        await attachPhoto({ bytes, assetId: asset.id, userId, organizationId });
      } catch {
        warnings.push(
          "The asset was created, but its photo couldn't be saved. Add it from the asset's page."
        );
      }
    }
    if (draft.source === "receipt") {
      try {
        let attached = false;
        if (draft.emailReceiptId && sequentialId) {
          attached =
            (await assignEmailReceipt(
              organizationId,
              draft.emailReceiptId,
              sequentialId
            )) !== null;
        }
        if (!attached && bytes) {
          await storeAttachmentBytes({
            organizationId,
            assetId: asset.id,
            userId,
            originalName: draft.fileName ?? "receipt",
            bytes,
          });
        }
      } catch {
        warnings.push(
          "The asset was created, but the receipt couldn't be attached. Add it from the asset's Attachments tab."
        );
      }
    }

    await addAssetActivity({
      organizationId,
      assetIds: [asset.id],
      userId,
      action: `created this asset from ${
        draft.source === "photo" ? "a photo" : "a receipt"
      }, with Claude's suggestions.`,
    });
    await db.assetDraft.update({
      where: { id: draftId, organizationId },
      data: {
        status: "created",
        createdAssetId: asset.id,
        fileBytes: null,
        sourceText: null,
      },
    });
    if (printLabel) {
      try {
        await queueLabels({
          organizationId,
          assetIds: [asset.id],
          source: "asset",
          userId,
        });
      } catch {
        warnings.push(
          "The asset was created, but its label couldn't be queued."
        );
      }
    }
    return { assetId: asset.id, sequentialId, warnings };
  } catch (cause) {
    await db.assetDraft.updateMany({
      where: { id: draftId, organizationId, status: "creating" },
      data: { status: draft.name ? "ready" : "failed" },
    });
    throw cause;
  }
}
