/**
 * Finding new pictures (fork): reading Claude's answer and a page's photo.
 */
import { describe, expect, it } from "vitest";
import { pagePicture, parsePictureUrls, pictureQuestion } from "./pictures";

describe("parsePictureUrls", () => {
  it("reads the JSON answer, best first, without repeats", () => {
    expect(
      parsePictureUrls(
        'Here you go:\n{"urls": ["https://shop.example/p/1", "https://img.example/a.jpg", "https://shop.example/p/1"]}'
      )
    ).toEqual(["https://shop.example/p/1", "https://img.example/a.jpg"]);
  });

  it("falls back to addresses in plain text", () => {
    expect(
      parsePictureUrls("Try https://a.example/x.png and (https://b.example/y).")
    ).toEqual(["https://a.example/x.png", "https://b.example/y"]);
  });

  it("drops anything that isn't a web address", () => {
    expect(
      parsePictureUrls(
        '{"urls": ["javascript:alert(1)", "ftp://x/y", 42, "nope"]}'
      )
    ).toEqual([]);
    expect(parsePictureUrls(null)).toEqual([]);
  });

  it("keeps it to eight", () => {
    const urls = Array.from(
      { length: 12 },
      (_, i) => `"https://x.example/${i}"`
    );
    expect(parsePictureUrls(`{"urls": [${urls.join(",")}]}`)).toHaveLength(8);
  });
});

describe("pagePicture", () => {
  it("takes the page's sharing photo, made a full address", () => {
    const html =
      '<head><meta property="og:title" content="Drill"><meta content="/img/drill.jpg?a=1&amp;b=2" property="og:image"></head>';
    expect(pagePicture(html, "https://shop.example/p/1")).toBe(
      "https://shop.example/img/drill.jpg?a=1&b=2"
    );
  });

  it("prefers og:image to twitter:image, and reads name= too", () => {
    const html =
      "<meta name='twitter:image' content='https://t.example/t.jpg'><meta property='og:image' content='https://o.example/o.jpg'>";
    expect(pagePicture(html, "https://x.example")).toBe(
      "https://o.example/o.jpg"
    );
    expect(
      pagePicture(
        "<meta name='twitter:image' content='https://t.example/t.jpg'>",
        "https://x.example"
      )
    ).toBe("https://t.example/t.jpg");
  });

  it("finds nothing on a page without one", () => {
    expect(
      pagePicture("<html><body>hi</body></html>", "https://x.example")
    ).toBeNull();
    expect(
      pagePicture(
        "<meta property='og:image' content='data:image/png;base64,AA'>",
        "https://x.example"
      )
    ).toBeNull();
  });
});

describe("pictureQuestion", () => {
  it("names the item, with its category and a short description", () => {
    expect(
      pictureQuestion({
        title: " Makita DHP485 ",
        category: "Tools",
        description: "x".repeat(600),
      })
    ).toBe(
      `Item: Makita DHP485\nCategory: Tools\nDescription: ${"x".repeat(400)}`
    );
  });
});
