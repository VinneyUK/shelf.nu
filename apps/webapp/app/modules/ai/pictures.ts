/**
 * Finding new pictures for assets (fork): the parts that don't need a network.
 * Reading Claude's list of addresses, and the picture a product page offers.
 */

/** How many pictures to offer for each asset */
export const PICTURES_PER_ASSET = 4;

export const PICTURE_SYSTEM = `You find photos of products on the web for a home inventory app.
Search for the item you're given and find pages that show that exact product, preferably the maker's or a big UK retailer's product page, or a direct link to a product photo.
Reply with JSON only, no other text: {"urls": ["https://...", ...]} with up to 6 addresses, best first. Use addresses you actually saw in your searches. If you find nothing suitable, reply {"urls": []}.`;

/** The question for one asset. */
export function pictureQuestion(asset: {
  title: string;
  category?: string | null;
  description?: string | null;
}) {
  const lines = [`Item: ${asset.title.trim()}`];
  if (asset.category) lines.push(`Category: ${asset.category}`);
  const description = asset.description?.trim();
  if (description) lines.push(`Description: ${description.slice(0, 400)}`);
  return lines.join("\n");
}

/** The http(s) addresses in Claude's answer: its JSON, or failing that any URLs in the text. */
export function parsePictureUrls(text: string | null): string[] {
  if (!text) return [];
  let urls: unknown[] = [];
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (json) {
    try {
      const parsed = JSON.parse(json) as { urls?: unknown };
      if (Array.isArray(parsed.urls)) urls = parsed.urls;
    } catch {
      /* fall through to the plain text */
    }
  }
  if (urls.length === 0) urls = text.match(/https?:\/\/[^\s"'<>)\]]+/g) ?? [];
  const out: string[] = [];
  for (const u of urls) {
    if (typeof u !== "string") continue;
    try {
      const url = new URL(u.trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      if (!out.includes(url.toString())) out.push(url.toString());
    } catch {
      /* not an address */
    }
  }
  return out.slice(0, 8);
}

const META = /<meta\b[^>]*>/gi;
const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));

/** The product photo a page names for sharing (og:image, twitter:image), as a full address. */
export function pagePicture(html: string, pageUrl: string): string | null {
  const wanted = [
    "og:image:secure_url",
    "og:image",
    "twitter:image",
    "twitter:image:src",
  ];
  const found: Record<string, string> = {};
  for (const tag of html.slice(0, 400_000).match(META) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))
      ?.slice(2)
      .find(Boolean);
    const content = attr(tag, "content")?.slice(2).find(Boolean);
    if (key && content && !found[key.toLowerCase()])
      found[key.toLowerCase()] = content;
  }
  const raw = wanted.map((k) => found[k]).find(Boolean);
  if (!raw) return null;
  try {
    const url = new URL(raw.replace(/&amp;/g, "&").trim(), pageUrl);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
