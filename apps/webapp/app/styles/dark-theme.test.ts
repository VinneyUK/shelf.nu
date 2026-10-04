/**
 * The dark theme (fork): it must cover every colour class in the app, be up to
 * date, keep the cascade right, and stay readable.
 * Part of the dark theme; not in upstream Shelf.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDarkCss,
  contrast,
  darkColor,
  lightColor,
  MANUAL_TOKENS,
  NEUTRAL_BG,
  OUT_FILE,
  PAGE,
} from "../../scripts/dark-theme";

const built = buildDarkCss();
const FIX =
  "Run `npx tsx scripts/dark-theme.ts` in apps/webapp, then commit app/styles/dark.css.";

describe("dark theme coverage", () => {
  it("is up to date with the classes used in the app", () => {
    expect(fs.readFileSync(OUT_FILE, "utf8"), FIX).toBe(built.css);
  });

  it("handles every colour class (or lists it as hand-written)", () => {
    const missing = [...built.unsupported.keys()].filter(
      (t) => !MANUAL_TOKENS.has(t)
    );
    expect(
      missing,
      `Add rules to scripts/dark-theme-extras.ts and list them in MANUAL_TOKENS: ${missing.join(
        ", "
      )}`
    ).toEqual([]);
  });

  it("finds a sensible number of classes (so a broken scan can't pass by finding none)", () => {
    expect(built.tokens).toBeGreaterThan(250);
    expect(built.rules).toBeGreaterThan(200);
  });
});

describe("dark theme cascade", () => {
  const css = built.css;
  const at = (needle: string) => {
    const i = css.indexOf(needle);
    expect(i, `missing rule: ${needle}`).toBeGreaterThan(-1);
    return i;
  };

  it("keeps the toggle's checked colour: the variant rule comes after, and is more specific than, the plain one", () => {
    const plain = at("html.dark .bg-gray-100 {");
    const checked = at(
      'html.dark .data-\\[state\\=checked\\]\\:bg-primary-400[data-state="checked"]'
    );
    expect(checked).toBeGreaterThan(plain);
  });

  it("emits unchanged variant classes too, so they can't be overridden by a plain class", () => {
    at("html.dark .hover\\:bg-error-600:hover"); // error-600 is a solid fill: unchanged, but still emitted
  });

  it("keeps responsive classes inside their breakpoint", () => {
    const media = at("@media (min-width: 768px) {");
    for (const line of css.split("\n")) {
      if (line.includes(".md\\:"))
        expect(css.indexOf(line)).toBeGreaterThan(media);
    }
  });

  it("gives inputs a dark background by exact class match, not a substring that skips disabled:bg-gray-50", () => {
    expect(css).toContain(':not([class~="bg-transparent"])');
    expect(css).not.toContain('[class*="bg-"]');
  });

  it("keeps the brand orange for primary text on dark, not a pale tint", () => {
    expect(darkColor("text", "primary", "700")).toBe(
      lightColor("primary", "500")
    );
    expect(darkColor("text", "primary", "600")).toBe(
      lightColor("primary", "500")
    );
  });

  it("includes the sidebar's variables (it reads them, not classes)", () => {
    at("--sidebar-background:");
  });
});

describe("dark theme readability", () => {
  const surfaces = [
    PAGE,
    NEUTRAL_BG["25"],
    NEUTRAL_BG["50"],
    NEUTRAL_BG["100"],
    NEUTRAL_BG["200"],
  ];
  const text = (family: string, shade: string) =>
    darkColor("text", family, shade) ?? lightColor(family, shade)!;
  const bg = (family: string, shade: string) =>
    darkColor("bg", family, shade) ?? lightColor(family, shade)!;

  it("greys read clearly on the dark surfaces", () => {
    for (const s of surfaces) {
      for (const shade of ["600", "700", "800", "900"])
        expect(
          contrast(text("gray", shade), s),
          `text-gray-${shade} on ${s}`
        ).toBeGreaterThanOrEqual(5);
      expect(
        contrast(text("gray", "500"), s),
        `text-gray-500 on ${s}`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(text("gray", "400"), s),
        `text-gray-400 on ${s}`
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("coloured text reads on its own tinted background", () => {
    for (const family of ["primary", "success", "error", "warning", "blue"]) {
      expect(
        contrast(text(family, "700"), bg(family, "50")),
        `${family}-700 on ${family}-50`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(text(family, "600"), bg(family, "50")),
        `${family}-600 on ${family}-50`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(text(family, "800"), bg(family, "100")),
        `${family}-800 on ${family}-100`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("solid fills with white text are left alone", () => {
    for (const family of ["primary", "error", "success"]) {
      expect(darkColor("bg", family, "600")).toBeNull();
      expect(
        contrast("#ffffff", lightColor(family, "600")!)
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
