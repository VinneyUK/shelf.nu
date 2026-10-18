/**
 * Shrinking big photos before upload (fork): the sums.
 */
import { describe, expect, it } from "vitest";
import { fitWithin, needsShrinking, renamed } from "./shrink-image";

describe("fitWithin", () => {
  it("brings the longest side down to 2560 px, keeping the shape", () => {
    expect(fitWithin(6000, 4000)).toEqual({ width: 2560, height: 1707 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 1280, height: 2560 });
  });

  it("leaves a picture that already fits alone", () => {
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
  });
});

describe("needsShrinking", () => {
  it("shrinks big files or big pictures", () => {
    expect(needsShrinking({ size: 9_000_000 }, 1000, 800)).toBe(true);
    expect(needsShrinking({ size: 500_000 }, 4000, 3000)).toBe(true);
  });

  it("leaves small ones alone", () => {
    expect(needsShrinking({ size: 500_000 }, 1600, 1200)).toBe(false);
  });
});

describe("renamed", () => {
  it("changes the extension to match the new format", () => {
    expect(renamed("IMG_1234.HEIC.png", "webp")).toBe("IMG_1234.HEIC.webp");
    expect(renamed("photo", "jpg")).toBe("photo.jpg");
    expect(renamed(".png", "jpg")).toBe("image.jpg");
  });
});
