import { describe, expect, it } from "vitest";
import { detectAttachmentType } from "./detect";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);
const ftyp = (brand: string) =>
  new Uint8Array([0, 0, 0, 24, ...text("ftyp"), ...text(brand), 0, 0, 0, 0]);

describe("detectAttachmentType", () => {
  it("recognises PDFs by content, whatever the name", () => {
    expect(detectAttachmentType(text("%PDF-1.7\n..."), "receipt.pdf")).toEqual({
      contentType: "application/pdf",
      extension: "pdf",
    });
    expect(detectAttachmentType(text("%PDF-1.4"), "scan")).toMatchObject({
      contentType: "application/pdf",
    });
  });

  it("recognises JPEG and PNG photos", () => {
    expect(
      detectAttachmentType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10), "IMG_1.jpg")
    ).toMatchObject({ contentType: "image/jpeg", extension: "jpg" });
    expect(
      detectAttachmentType(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0),
        "a.png"
      )
    ).toMatchObject({ contentType: "image/png" });
  });

  it("recognises HEIC and HEIF photos from an iPhone", () => {
    expect(detectAttachmentType(ftyp("heic"), "IMG_1240.HEIC")).toMatchObject({
      contentType: "image/heic",
    });
    expect(detectAttachmentType(ftyp("mif1"), "photo.heif")).toMatchObject({
      contentType: "image/heif",
    });
  });

  it("rejects other ftyp files such as MP4 video", () => {
    expect(detectAttachmentType(ftyp("isom"), "video.heic")).toBeNull();
  });

  it("accepts saved emails with an .eml name and email headers", () => {
    const eml = text(
      "Return-Path: <orders@example.com>\r\nFrom: Shop <orders@example.com>\r\nSubject: Your receipt\r\n\r\nThanks!"
    );
    expect(detectAttachmentType(eml, "Order 1234.eml")).toEqual({
      contentType: "message/rfc822",
      extension: "eml",
    });
  });

  it("rejects email-like text without the .eml name", () => {
    expect(
      detectAttachmentType(text("From: someone\r\nSubject: hi"), "note.txt")
    ).toBeNull();
  });

  it("rejects a web page renamed to .eml", () => {
    expect(
      detectAttachmentType(
        text("<!DOCTYPE html><html><script>alert(1)</script>"),
        "x.eml"
      )
    ).toBeNull();
    expect(
      detectAttachmentType(text("<html>\nFrom: a\nSubject: b"), "x.eml")
    ).toBeNull();
  });

  it("rejects binary files renamed to .eml", () => {
    expect(
      detectAttachmentType(
        bytes(0x46, 0x72, 0x6f, 0x6d, 0x3a, 0, 1, 2),
        "x.eml"
      )
    ).toBeNull();
  });

  it("rejects files that only pretend by name", () => {
    expect(
      detectAttachmentType(text("<svg onload=alert(1)>"), "receipt.pdf")
    ).toBeNull();
    expect(detectAttachmentType(text("MZ\x90\x00"), "photo.jpg")).toBeNull();
    expect(detectAttachmentType(new Uint8Array(), "empty.pdf")).toBeNull();
  });
});
