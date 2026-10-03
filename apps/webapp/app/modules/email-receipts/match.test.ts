import { describe, expect, it } from "vitest";
import {
  assetIdsInSubject,
  emailFileName,
  isAllowedSender,
  parseAllowedSenders,
  receiptParts,
} from "./match";

describe("assetIdsInSubject", () => {
  it("finds every asset ID, in any case, once each", () => {
    expect(
      assetIdsInSubject(
        "Fwd: Your order has shipped SAM-0017 and sam-0018, SAM-0017"
      )
    ).toEqual(["SAM-0017", "SAM-0018"]);
  });
  it("finds nothing in an ordinary subject", () => {
    expect(assetIdsInSubject("Your Amazon.co.uk order of 2 items")).toEqual([]);
    expect(assetIdsInSubject("Order 2026-10-03")).toEqual([]);
  });
});

describe("allowed senders", () => {
  it("reads one per line or comma, and ignores junk", () => {
    expect(
      parseAllowedSenders(
        " Ant@Example.com\nme@icloud.com, not-an-address\n\nme@icloud.com"
      )
    ).toEqual(["ant@example.com", "me@icloud.com"]);
  });
  it("matches regardless of case, and refuses everyone else", () => {
    const allowed = ["ant@example.com"];
    expect(isAllowedSender("ANT@example.com ", allowed)).toBe(true);
    expect(isAllowedSender("spam@example.com", allowed)).toBe(false);
    expect(isAllowedSender(undefined, allowed)).toBe(false);
    expect(isAllowedSender("ant@example.com", [])).toBe(false);
  });
});

describe("receiptParts", () => {
  it("keeps the invoice, drops the logo and other files", () => {
    const parts = [
      {
        filename: "logo.png",
        contentType: "image/png",
        contentDisposition: "inline",
        related: true,
        size: 70,
      },
      {
        filename: "invoice-55.pdf",
        contentType: "application/pdf",
        contentDisposition: "attachment",
        size: 82,
      },
      {
        filename: "photo.HEIC",
        contentType: "image/heic",
        contentDisposition: "attachment",
        size: 900,
      },
      {
        filename: "terms.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        contentDisposition: "attachment",
        size: 500,
      },
      {
        filename: "empty.pdf",
        contentType: "application/pdf",
        contentDisposition: "attachment",
        size: 0,
      },
    ];
    expect(receiptParts(parts).map((p) => p.filename)).toEqual([
      "invoice-55.pdf",
      "photo.HEIC",
    ]);
  });
});

describe("emailFileName", () => {
  it("drops Fwd/Re, keeps the date, and makes a safe file name", () => {
    expect(
      emailFileName(
        "Fwd: RE: Your order: #55 / shipped",
        new Date("2026-10-03T17:00:00Z")
      )
    ).toBe("2026-10-03 Your order #55 shipped.eml");
    expect(emailFileName("", null)).toBe("Email receipt.eml");
  });
});
