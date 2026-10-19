/**
 * Filament pictures' small copies (fork): made once from the full picture,
 * kept, and served instead of it in tiles and lists.
 */
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  row: null as null | {
    bytes: Uint8Array | null;
    thumb: Uint8Array | null;
    status: string;
    contentType?: string;
  },
  saved: [] as unknown[],
}));

vi.mock("~/database/db.server", () => ({
  db: {
    filamentImage: {
      findUnique: vi.fn(() => m.row),
      updateMany: vi.fn((args) => {
        m.saved.push(args);
        return Promise.resolve({ count: 1 });
      }),
    },
  },
}));

const { getFilamentThumb, THUMB_SIZE } = await import("./images.server");

const picture = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#D62B2B" } })
    .png()
    .toBuffer();

beforeEach(() => {
  m.row = null;
  m.saved = [];
});

describe("getFilamentThumb", () => {
  it("makes a 480 px WebP from a big picture and keeps it", async () => {
    m.row = {
      bytes: new Uint8Array(await picture(1600, 1200)),
      thumb: null,
      status: "found",
    };
    const out = await getFilamentThumb("o1", "pla basic|red");
    expect(out?.contentType).toBe("image/webp");
    const meta = await sharp(Buffer.from(out!.bytes)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(THUMB_SIZE);
    expect(meta.height).toBe(360);
    expect(m.saved[0]).toMatchObject({
      where: { organizationId: "o1", key: "pla basic|red" },
    });
  });

  it("serves the kept copy without making it again", async () => {
    const kept = new Uint8Array([1, 2, 3]);
    m.row = { bytes: new Uint8Array([9]), thumb: kept, status: "found" };
    const out = await getFilamentThumb("o1", "k");
    expect(out?.bytes).toEqual(kept);
    expect(m.saved).toHaveLength(0);
  });

  it("doesn't enlarge a small picture", async () => {
    m.row = {
      bytes: new Uint8Array(await picture(200, 200)),
      thumb: null,
      status: "found",
    };
    const meta = await sharp(
      Buffer.from((await getFilamentThumb("o1", "k"))!.bytes)
    ).metadata();
    expect(meta.width).toBe(200);
  });

  it("has nothing when there's no picture", async () => {
    m.row = { bytes: null, thumb: null, status: "missing" };
    expect(await getFilamentThumb("o1", "k")).toBeNull();
  });
});
