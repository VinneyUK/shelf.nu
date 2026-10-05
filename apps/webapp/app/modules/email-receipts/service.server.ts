/**
 * Email receipts: Shelf checks a mailbox over IMAP every minute and attaches
 * forwarded receipts to the assets named in the subject (e.g. "Fwd: … SAM-0017").
 * Part of the email receipts feature; not in upstream Shelf.
 *
 * Each email is recorded in EmailReceipt (so it's never handled twice) and
 * then moved to the processed folder. Only allowed senders are accepted.
 * Emails naming no known asset wait in the Unmatched list, their files stored
 * against the receipt until they're put on an asset or discarded.
 */
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { db } from "~/database/db.server";
import { getSupabaseAdmin } from "~/integrations/supabase/client";
import { addAssetActivity } from "~/modules/activity/service.server";
import { ATTACHMENTS_BUCKET } from "~/modules/asset-attachment/constants";
import { storeAttachmentBytes } from "~/modules/asset-attachment/service.server";
import { ShelfError } from "~/utils/error";
import type { ErrorLabel } from "~/utils/error";
import { Logger } from "~/utils/logger";
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
} from "~/utils/secret-box.server"; // fork: secrets at rest
import {
  assetIdsInSubject,
  emailFileName,
  isAllowedSender,
  receiptParts,
} from "./match";

const label: ErrorLabel = "Assets";
/** Emails handled per check, so a backlog can't hold the server up */
const BATCH = 20;

// ------------------------------------------------------------------ settings

type SettingsRow = Awaited<ReturnType<typeof getSettingsRow>>;

async function getSettingsRow(organizationId: string) {
  const row = await db.emailReceiptSettings.findUnique({
    where: { organizationId },
  });
  // A password saved before encryption existed is encrypted the first time it's read
  if (row?.password && !isEncrypted(row.password)) {
    await db.emailReceiptSettings.update({
      where: { organizationId },
      data: { password: encryptSecret(row.password) },
    });
  }
  return {
    enabled: false,
    host: "imap.gmail.com",
    port: 993,
    username: "",
    mailbox: "INBOX",
    processedFolder: "Shelf",
    allowedSenders: [] as string[],
    lastCheckedAt: null as Date | null,
    lastError: null as string | null,
    ...(row ?? {}),
    password: decryptSecret(row?.password ?? ""),
  };
}

/** Settings safe for the browser: the password never leaves the server. */
export async function getEmailReceiptSettings(organizationId: string) {
  const { password, ...rest } = await getSettingsRow(organizationId);
  return {
    enabled: rest.enabled,
    host: rest.host,
    port: rest.port,
    username: rest.username,
    mailbox: rest.mailbox,
    processedFolder: rest.processedFolder,
    allowedSenders: rest.allowedSenders,
    lastCheckedAt: rest.lastCheckedAt,
    lastError: rest.lastError,
    hasPassword: password.length > 0,
  };
}

export async function saveEmailReceiptSettings(
  organizationId: string,
  input: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    /** Blank keeps the saved password */
    password: string;
    mailbox: string;
    processedFolder: string;
    allowedSenders: string[];
  }
) {
  const data = {
    enabled: input.enabled,
    host: input.host.trim(),
    port: input.port,
    username: input.username.trim(),
    mailbox: input.mailbox.trim() || "INBOX",
    processedFolder: input.processedFolder.trim() || "Shelf",
    allowedSenders: input.allowedSenders,
    // Gmail shows app passwords in groups of four; the spaces aren't part of it
    ...(input.password.trim()
      ? { password: encryptSecret(input.password.replace(/\s+/g, "")) }
      : {}),
  };
  await db.emailReceiptSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
}

// ------------------------------------------------------------------- mailbox

function client(s: SettingsRow) {
  return new ImapFlow({
    host: s.host,
    port: s.port,
    secure: s.port === 993,
    auth: { user: s.username, pass: s.password },
    logger: false,
    socketTimeout: 60_000,
  });
}

/** Turns IMAP failures into something a person can act on. */
function explain(cause: unknown): string {
  const text =
    cause instanceof Error
      ? `${cause.message} ${
          (cause as { responseText?: string }).responseText ?? ""
        }`
      : String(cause);
  if (/AUTHENTICATIONFAILED|Invalid credentials|authenticat/i.test(text)) {
    return "The mailbox refused the login. Check the address and app password (for Gmail, an app password, not your normal one).";
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timeout/i.test(text)) {
    return "Couldn't reach the mail server. Check the server name and port, and that Cube is online.";
  }
  return `The mailbox gave an error: ${text.slice(0, 200)}`;
}

/** Logs in and counts what's waiting, without changing anything. */
export async function testEmailConnection(organizationId: string) {
  const s = await getSettingsRow(organizationId);
  if (!s.username || !s.password) {
    throw new ShelfError({
      cause: null,
      message: "Save the mailbox address and app password first.",
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  }
  const imap = client(s);
  try {
    await imap.connect();
    const status = await imap.status(s.mailbox, { messages: true });
    return status.messages ?? 0;
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: explain(cause),
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  } finally {
    await imap.logout().catch(() => {});
  }
}

// --------------------------------------------------------------- processing

/** Saves the email itself, and its PDFs and photos, against an asset or the Unmatched list. */
async function storeEmailFiles({
  organizationId,
  assetId,
  emailReceiptId,
  raw,
  mail,
}: {
  organizationId: string;
  assetId: string | null;
  emailReceiptId: string | null;
  raw: Buffer;
  mail: ParsedMail;
}) {
  let stored = 0;
  const skipped: string[] = [];
  const files = [
    { name: emailFileName(mail.subject ?? "", mail.date ?? null), bytes: raw },
    ...receiptParts(mail.attachments).map((part) => ({
      name:
        part.filename ||
        `attachment.${part.contentType.split("/")[1] ?? "bin"}`,
      bytes: part.content,
    })),
  ];
  for (const file of files) {
    try {
      await storeAttachmentBytes({
        organizationId,
        assetId,
        userId: null,
        originalName: file.name,
        bytes: new Uint8Array(file.bytes),
        emailReceiptId,
      });
      stored++;
    } catch (cause) {
      // One unreadable or oversized file shouldn't lose the rest
      skipped.push(cause instanceof ShelfError ? cause.message : file.name);
    }
  }
  return { stored, skipped };
}

async function handleMessage(
  organizationId: string,
  s: SettingsRow,
  raw: Buffer
) {
  const mail = await simpleParser(raw);
  const from = mail.from?.value?.[0]?.address?.toLowerCase() ?? "";
  const subject = (mail.subject ?? "").slice(0, 500);
  const messageId = (
    mail.messageId ?? `${from}|${mail.date?.toISOString() ?? ""}|${subject}`
  ).slice(0, 500);

  const seen = await db.emailReceipt.findUnique({
    where: { organizationId_messageId: { organizationId, messageId } },
    select: { id: true },
  });
  if (seen) return;

  const base = {
    organizationId,
    messageId,
    fromAddress: from,
    subject,
    receivedAt: mail.date ?? null,
  };

  if (!isAllowedSender(from, s.allowedSenders)) {
    await db.emailReceipt.create({
      data: {
        ...base,
        status: "ignored",
        reason: s.allowedSenders.length
          ? `${from || "Unknown sender"} isn't an allowed sender.`
          : "No allowed senders are set up.",
      },
    });
    return;
  }

  const ids = assetIdsInSubject(subject);
  const assets = ids.length
    ? await db.asset.findMany({
        where: { organizationId, sequentialId: { in: ids } },
        select: { id: true, sequentialId: true },
      })
    : [];

  if (assets.length === 0) {
    const receipt = await db.emailReceipt.create({
      data: {
        ...base,
        status: "unmatched",
        reason: ids.length
          ? `No asset with ID ${ids.join(", ")}.`
          : "No asset ID in the subject.",
      },
    });
    await storeEmailFiles({
      organizationId,
      assetId: null,
      emailReceiptId: receipt.id,
      raw,
      mail,
    });
    // AI feature: Claude reads it into drafts. If that can't happen, it simply
    // stays in the Unmatched list as before.
    try {
      // loaded here, not at the top: drafts also imports this module
      const { draftsFromEmailedReceipt } = await import("~/modules/ai/drafts.server");
      await draftsFromEmailedReceipt({
        organizationId,
        emailReceiptId: receipt.id,
        subject: mail.subject ?? "",
        text: mail.text ?? null,
        files: receiptParts(mail.attachments).map((part) => ({
          name: part.filename || "receipt",
          type: part.contentType,
          bytes: new Uint8Array(part.content),
        })),
      });
    } catch {
      // never let drafting stop the email being handled
    }
    return;
  }

  const skippedAll: string[] = [];
  for (const asset of assets) {
    const { skipped } = await storeEmailFiles({
      organizationId,
      assetId: asset.id,
      emailReceiptId: null,
      raw,
      mail,
    });
    skippedAll.push(...skipped);
  }
  await db.emailReceipt.create({
    data: {
      ...base,
      status: "attached",
      attachedTo: assets.map((a) => a.sequentialId ?? a.id),
      reason: skippedAll.length
        ? `Some files were skipped: ${[...new Set(skippedAll)].join(
            " "
          )}`.slice(0, 500)
        : null,
    },
  });
}

let checking = false;

/** Handles new mail for one workspace. Records any failure on the settings. */
export async function checkMailbox(organizationId: string) {
  const s = await getSettingsRow(organizationId);
  if (!s.username || !s.password) return { handled: 0 };
  const imap = client(s);
  let handled = 0;
  try {
    await imap.connect();
    // The processed folder; "already exists" is fine
    await imap.mailboxCreate(s.processedFolder).catch(() => {});
    const lock = await imap.getMailboxLock(s.mailbox);
    try {
      const uids = (
        (await imap.search({ all: true }, { uid: true })) || []
      ).slice(0, BATCH);
      for (const uid of uids) {
        const message = await imap.fetchOne(
          String(uid),
          { source: true },
          { uid: true }
        );
        if (message && message.source) {
          try {
            await handleMessage(organizationId, s, message.source);
          } catch (cause) {
            Logger.error(
              new ShelfError({
                cause,
                message: "Couldn't handle an emailed receipt",
                label,
              })
            );
            continue; // leave it in the inbox to try again next time
          }
        }
        await imap.messageMove(String(uid), s.processedFolder, { uid: true });
        handled++;
      }
    } finally {
      lock.release();
    }
    await db.emailReceiptSettings.updateMany({
      where: { organizationId },
      data: { lastCheckedAt: new Date(), lastError: null },
    });
  } catch (cause) {
    await db.emailReceiptSettings.updateMany({
      where: { organizationId },
      data: { lastCheckedAt: new Date(), lastError: explain(cause) },
    });
  } finally {
    await imap.logout().catch(() => {});
  }
  return { handled };
}

/** Every workspace with email receipts switched on. Never throws. */
export async function checkAllMailboxes() {
  if (checking) return;
  checking = true;
  try {
    const workspaces = await db.emailReceiptSettings.findMany({
      where: { enabled: true },
      select: { organizationId: true },
    });
    for (const { organizationId } of workspaces)
      await checkMailbox(organizationId);
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message: "Checking for emailed receipts failed",
        label,
      })
    );
  } finally {
    checking = false;
  }
}

// ----------------------------------------------------------- the settings page

/** Unmatched receipts with their files, and the recent log. */
export async function getEmailReceipts(organizationId: string) {
  const [unmatched, recent] = await Promise.all([
    db.emailReceipt.findMany({
      where: { organizationId, status: "unmatched" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.emailReceipt.findMany({
      where: { organizationId, status: { not: "unmatched" } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const files = unmatched.length
    ? await db.assetAttachment.findMany({
        where: {
          organizationId,
          emailReceiptId: { in: unmatched.map((r) => r.id) },
        },
        select: {
          id: true,
          fileName: true,
          contentType: true,
          size: true,
          storagePath: true,
          emailReceiptId: true,
        },
      })
    : [];
  const bucket = getSupabaseAdmin().storage.from(ATTACHMENTS_BUCKET);
  const withLinks = await Promise.all(
    files.map(async ({ storagePath, ...file }) => {
      const { data } = await bucket.createSignedUrl(
        storagePath,
        60 * 60,
        file.contentType === "message/rfc822"
          ? { download: file.fileName }
          : undefined
      );
      return { ...file, openUrl: data?.signedUrl ?? null };
    })
  );
  return {
    unmatched: unmatched.map((r) => ({
      ...r,
      files: withLinks.filter((f) => f.emailReceiptId === r.id),
    })),
    recent,
  };
}

/** Puts an unmatched receipt's files on the asset with this ID (e.g. SAM-0017). */
export async function assignEmailReceipt(
  organizationId: string,
  receiptId: string,
  assetCode: string
) {
  const code = assetCode.trim().toUpperCase();
  const asset = await db.asset.findFirst({
    where: { organizationId, sequentialId: code },
    select: { id: true, sequentialId: true },
  });
  if (!asset) {
    throw new ShelfError({
      cause: null,
      message: `There's no asset with the ID ${code || "(blank)"}.`,
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  }
  const { count } = await db.emailReceipt.updateMany({
    where: { id: receiptId, organizationId, status: "unmatched" },
    data: {
      status: "attached",
      attachedTo: [asset.sequentialId ?? code],
      reason: null,
    },
  });
  if (count === 0) return null;
  const files = await db.assetAttachment.findMany({
    where: { organizationId, emailReceiptId: receiptId },
    select: { fileName: true },
  });
  await db.assetAttachment.updateMany({
    where: { organizationId, emailReceiptId: receiptId },
    data: { assetId: asset.id, emailReceiptId: null },
  });
  for (const file of files) {
    await addAssetActivity({
      organizationId,
      assetIds: [asset.id],
      userId: null,
      action: `attached **${file.fileName}** from an emailed receipt.`,
    });
  }
  return asset.sequentialId;
}

/** Deletes an unmatched receipt's files and marks it discarded. */
export async function discardEmailReceipt(
  organizationId: string,
  receiptId: string
) {
  const files = await db.assetAttachment.findMany({
    where: { organizationId, emailReceiptId: receiptId, assetId: null },
    select: { id: true, storagePath: true },
  });
  if (files.length) {
    await getSupabaseAdmin()
      .storage.from(ATTACHMENTS_BUCKET)
      .remove(files.map((f) => f.storagePath));
    await db.assetAttachment.deleteMany({
      where: { organizationId, id: { in: files.map((f) => f.id) } },
    });
  }
  await db.emailReceipt.updateMany({
    where: { id: receiptId, organizationId, status: "unmatched" },
    data: { status: "discarded" },
  });
}

// ------------------------------------------------------------------ worker

declare global {
  var shelfEmailReceiptWorkerStarted: boolean | undefined;
}

/** Checks every enabled mailbox once a minute. */
export function startEmailReceiptWorker() {
  if (global.shelfEmailReceiptWorkerStarted) return;
  global.shelfEmailReceiptWorkerStarted = true;
  setInterval(() => void checkAllMailboxes(), 60_000);
  setTimeout(() => void checkAllMailboxes(), 15_000);
}
