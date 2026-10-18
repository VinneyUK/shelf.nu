/**
 * Finding new pictures (fork): following Claude's addresses to real pictures,
 * and setting the chosen one. The network, Claude and storage are pretend.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  asset: { findFirst: vi.fn() },
  ai: vi.fn(),
  research: vi.fn(),
  fetch: vi.fn(),
  setImage: vi.fn(),
}));

vi.mock("~/database/db.server", () => ({ db: { asset: m.asset } }));
vi.mock("./settings.server", () => ({ getAiSettingsRow: m.ai }));
vi.mock("./price-research.server", () => ({ researchPrice: m.research }));
vi.mock("~/utils/ssrf.server", () => ({ safeFetch: m.fetch }));
vi.mock("~/modules/asset/service.server", () => ({
  updateAssetMainImage: m.setImage,
}));

const { findPictures, setPictureFromUrl } = await import("./pictures.server");

const page = (photo: string) => ({
  contentType: "text/html; charset=utf-8",
  buffer: Buffer.from(`<meta property="og:image" content="${photo}">`),
});
const image = { contentType: "image/jpeg", buffer: Buffer.from([1, 2, 3]) };

beforeEach(() => {
  vi.clearAllMocks();
  m.asset.findFirst.mockResolvedValue({
    id: "a1",
    title: "Makita drill",
    description: null,
    category: { name: "Tools" },
  });
  m.ai.mockResolvedValue({
    enabled: true,
    apiKey: "key",
    model: "m",
    workspaceId: "",
  });
});

describe("findPictures", () => {
  it("offers real pictures: photos as they are, pages by their own photo", async () => {
    m.research.mockResolvedValue({
      text: '{"urls": ["https://shop.example/p", "https://img.example/a.jpg", "https://bad.example/x"]}',
      searches: 1,
      error: null,
    });
    m.fetch.mockImplementation((url: string) => {
      if (url === "https://shop.example/p")
        return Promise.resolve(page("/big/drill.jpg"));
      if (url === "https://shop.example/big/drill.jpg")
        return Promise.resolve(image);
      if (url === "https://img.example/a.jpg") return Promise.resolve(image);
      return Promise.reject(new Error("blocked"));
    });
    const out = await findPictures({ organizationId: "o1", assetId: "a1" });
    expect(out).toEqual({
      assetId: "a1",
      title: "Makita drill",
      pictures: [
        "https://shop.example/big/drill.jpg",
        "https://img.example/a.jpg",
      ],
      error: null,
    });
    expect(m.research.mock.calls[0][0]).toMatchObject({
      what: "picture search",
      apiKey: "key",
    });
  });

  it("says why when nothing is found", async () => {
    m.research.mockResolvedValue({
      text: null,
      searches: 0,
      error: "Anthropic's web search is unavailable right now.",
    });
    const out = await findPictures({ organizationId: "o1", assetId: "a1" });
    expect(out.pictures).toEqual([]);
    expect(out.error).toBe("Anthropic's web search is unavailable right now.");
  });

  it("needs AI switched on with a key, and doesn't search without it", async () => {
    m.ai.mockResolvedValue({ enabled: false, apiKey: "" });
    const out = await findPictures({ organizationId: "o1", assetId: "a1" });
    expect(out.error).toMatch(/Settings → AI/);
    expect(m.research).not.toHaveBeenCalled();
  });

  it("only looks up the workspace's own assets", async () => {
    m.asset.findFirst.mockResolvedValue(null);
    const out = await findPictures({ organizationId: "o1", assetId: "x" });
    expect(out.error).toBe("That asset isn't here.");
    expect(m.asset.findFirst.mock.calls[0][0].where).toEqual({
      id: "x",
      organizationId: "o1",
    });
  });
});

describe("setPictureFromUrl", () => {
  it("makes the picture the main image through Shelf's own pipeline", async () => {
    m.fetch.mockResolvedValue({ ...image, contentType: "image/png" });
    await setPictureFromUrl({
      organizationId: "o1",
      userId: "u1",
      assetId: "a1",
      url: "https://img.example/a.png",
    });
    const args = m.setImage.mock.calls[0][0];
    expect(args).toMatchObject({
      assetId: "a1",
      userId: "u1",
      organizationId: "o1",
    });
    const file = (await args.request.formData()).get("mainImage") as File;
    expect(file.type).toBe("image/png");
    expect(file.name).toBe("picture.png");
  });

  it("refuses an address that isn't a picture", async () => {
    m.fetch.mockResolvedValue(page("x"));
    await expect(
      setPictureFromUrl({
        organizationId: "o1",
        userId: "u1",
        assetId: "a1",
        url: "https://x.example",
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(m.setImage).not.toHaveBeenCalled();
  });
});
