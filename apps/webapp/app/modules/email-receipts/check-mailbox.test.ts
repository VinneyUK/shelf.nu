/**
 * The mailbox check end to end, against a pretend mailbox and database.
 * Part of the email receipts feature; not in upstream Shelf.
 */
/* eslint-disable @typescript-eslint/require-await -- the fakes below stand in for async APIs (IMAP, Prisma), so they keep async signatures */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mailbox = vi.hoisted(() => ({
  messages: new Map<number, Buffer>(),
  moved: [] as { uid: string; to: string }[],
  created: [] as string[],
  loginFails: false,
}));
const store = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
  receipts: [] as Record<string, unknown>[],
  stored: [] as {
    assetId: string | null;
    originalName: string;
    emailReceiptId: string | null;
  }[],
}));

vi.mock("imapflow", () => ({
  ImapFlow: class {
    async connect() {
      if (mailbox.loginFails) {
        throw Object.assign(new Error("Command failed"), {
          responseText: "Invalid credentials (Failure)",
        });
      }
    }
    async mailboxCreate(name: string) {
      mailbox.created.push(name);
    }
    async getMailboxLock() {
      return { release() {} };
    }
    async search() {
      return [...mailbox.messages.keys()];
    }
    async fetchOne(uid: string) {
      return { source: mailbox.messages.get(Number(uid)) };
    }
    async messageMove(uid: string, to: string) {
      mailbox.moved.push({ uid, to });
      mailbox.messages.delete(Number(uid));
    }
    async logout() {}
  },
}));

vi.mock("~/database/db.server", () => ({
  db: {
    emailReceiptSettings: {
      findUnique: async () => store.settings,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(store.settings!, data);
      },
    },
    emailReceipt: {
      findUnique: async ({
        where,
      }: {
        where: { organizationId_messageId: { messageId: string } };
      }) =>
        store.receipts.find(
          (r) => r.messageId === where.organizationId_messageId.messageId
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `r${store.receipts.length + 1}`, ...data };
        store.receipts.push(row);
        return row;
      },
    },
    asset: {
      findMany: async ({
        where,
      }: {
        where: { sequentialId: { in: string[] } };
      }) =>
        [{ id: "asset-17", sequentialId: "SAM-0017" }].filter((a) =>
          where.sequentialId.in.includes(a.sequentialId)
        ),
    },
  },
}));

vi.mock("~/modules/asset-attachment/service.server", () => ({
  storeAttachmentBytes: async (input: {
    assetId: string | null;
    originalName: string;
    emailReceiptId?: string | null;
  }) => {
    store.stored.push({
      assetId: input.assetId,
      originalName: input.originalName,
      emailReceiptId: input.emailReceiptId ?? null,
    });
    return { id: "f", fileName: input.originalName, contentType: "x", size: 1 };
  },
}));
vi.mock("~/integrations/supabase/client", () => ({
  getSupabaseAdmin: () => ({}),
}));
vi.mock("~/utils/logger", () => ({ Logger: { error: () => {} } }));

import { checkMailbox } from "./service.server";

const receipt = readFileSync(
  path.join(process.cwd(), "app/modules/email-receipts/fixtures/receipt.eml")
);
const withSubject = (subject: string, from = "ant@example.com", id = subject) =>
  Buffer.from(
    receipt
      .toString("latin1")
      .replace(/^Subject: .*$/m, `Subject: ${subject}`)
      .replace(/^From: .*$/m, `From: ${from}`)
      .replace(
        /^Message-ID: .*$/m,
        `Message-ID: <${id.replace(/\W/g, "")}@test>`
      ),
    "latin1"
  );

beforeEach(() => {
  mailbox.messages.clear();
  mailbox.moved = [];
  mailbox.created = [];
  mailbox.loginFails = false;
  store.receipts = [];
  store.stored = [];
  store.settings = {
    organizationId: "o1",
    enabled: true,
    username: "receipts@gmail.com",
    password: "abcdabcdabcdabcd",
    allowedSenders: ["ant@example.com"],
    processedFolder: "Shelf",
    mailbox: "INBOX",
    host: "imap.gmail.com",
    port: 993,
  };
});

describe("checkMailbox", () => {
  it("attaches a forwarded receipt to the asset in the subject: the email and its PDF, not the logo", async () => {
    mailbox.messages.set(
      1,
      withSubject("Fwd: Your order has shipped SAM-0017")
    );
    await checkMailbox("o1");

    expect(store.stored.map((s) => [s.assetId, s.originalName])).toEqual([
      ["asset-17", "2026-10-03 Your order has shipped SAM-0017.eml"],
      ["asset-17", "invoice-55.pdf"],
    ]);
    expect(store.receipts[0]).toMatchObject({
      status: "attached",
      attachedTo: ["SAM-0017"],
    });
    expect(mailbox.moved).toEqual([{ uid: "1", to: "Shelf" }]);
    expect(mailbox.created).toContain("Shelf");
  });

  it("ignores a stranger, keeping nothing, but still files the email away", async () => {
    mailbox.messages.set(1, withSubject("Fwd: SAM-0017", "spam@example.net"));
    await checkMailbox("o1");

    expect(store.stored).toEqual([]);
    expect(store.receipts[0]).toMatchObject({ status: "ignored" });
    expect(String(store.receipts[0].reason)).toContain(
      "isn't an allowed sender"
    );
    expect(mailbox.moved).toHaveLength(1);
  });

  it("keeps an email with no known asset ID for the Unmatched list", async () => {
    mailbox.messages.set(1, withSubject("Your Amazon.co.uk order"));
    mailbox.messages.set(2, withSubject("Fwd: SAM-9999 receipt"));
    await checkMailbox("o1");

    expect(store.receipts.map((r) => [r.status, r.reason])).toEqual([
      ["unmatched", "No asset ID in the subject."],
      ["unmatched", "No asset with ID SAM-9999."],
    ]);
    expect(
      store.stored.every((s) => s.assetId === null && s.emailReceiptId)
    ).toBe(true);
  });

  it("never handles the same email twice", async () => {
    mailbox.messages.set(
      1,
      withSubject("Fwd: SAM-0017", "ant@example.com", "same")
    );
    await checkMailbox("o1");
    mailbox.messages.set(
      2,
      withSubject("Fwd: SAM-0017", "ant@example.com", "same")
    );
    await checkMailbox("o1");

    expect(store.receipts).toHaveLength(1);
    expect(store.stored).toHaveLength(2); // the first time only: email + PDF
    expect(mailbox.moved).toHaveLength(2); // but both copies are filed away
  });

  it("explains a refused login in plain words", async () => {
    mailbox.loginFails = true;
    await checkMailbox("o1");
    expect(String(store.settings!.lastError)).toContain("refused the login");
  });
});
