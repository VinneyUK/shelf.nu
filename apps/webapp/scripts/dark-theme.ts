/**
 * Fork (VinneyUK/shelf.nu): generates app/styles/dark.css.
 *
 * Shelf has no dark colours of its own. Rather than hand-pick classes, this
 * scans the whole app for every Tailwind colour class (bg-, text-, border-,
 * ring-, divide-, gradient stops, fill, stroke, and so on, with every variant)
 * and writes a dark equivalent for each, under `html.dark`. The palette tables
 * below decide the colours; the resolved Tailwind config supplies the originals.
 *
 * Two rules keep the cascade right:
 *  - every class that carries a variant (hover:, data-[state=checked]:, md:)
 *    gets a rule even when its colour doesn't change, because the rules for
 *    plain classes are more specific than Tailwind's and would otherwise
 *    override the variant (this is what broke the toggle switch);
 *  - rules are ordered: plain classes, then state variants, then responsive.
 *
 * Plain elements, third-party widgets and CSS files with colours of their own
 * (headings, the table fade, the sidebar, the calendar...) are in
 * dark-theme-extras.ts.
 *
 *   npx tsx scripts/dark-theme.ts        # rewrite app/styles/dark.css
 *
 * app/styles/dark-theme.test.ts fails if a colour class is added that this
 * doesn't cover, or if dark.css is out of date: re-run the command above.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRAS } from "./dark-theme-extras";

const nodeRequire = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", "app");
export const OUT_FILE = path.join(APP_DIR, "styles", "dark.css");

type Shades = Record<string, string>;
export type Kind = "bg" | "text" | "border";

// ------------------------------------------------------------------ palette

let resolvedColors: Record<string, string | Shades> | null = null;

/** Shelf's resolved Tailwind colours, loaded the way Tailwind loads them. */
function allColors() {
  if (resolvedColors) return resolvedColors;
  const loadConfig = nodeRequire("tailwindcss/loadConfig") as (
    p: string
  ) => unknown;
  const resolveConfig = nodeRequire("tailwindcss/resolveConfig") as (
    c: unknown
  ) => {
    theme: { colors: Record<string, string | Shades> };
  };
  resolvedColors = resolveConfig(
    loadConfig(path.resolve(HERE, "..", "tailwind.config.ts"))
  ).theme.colors;
  return resolvedColors;
}

function palette(family: string): Shades | null {
  const entry = allColors()[family];
  return entry && typeof entry === "object" ? entry : null;
}

/** Colour families that are scanned for (anything with shades, except var()-driven ones). */
const SKIP_FAMILIES = new Set([
  "ring",
  "tremor",
  "dark-tremor",
  "sidebar",
  "muted",
]);
function scannedFamilies() {
  return Object.keys(allColors())
    .filter(
      (name) =>
        typeof allColors()[name] === "object" && !SKIP_FAMILIES.has(name)
    )
    .sort((a, b) => b.length - a.length);
}

// ------------------------------------------------------------ colour maths

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (rgb: number[]) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
/** `fg` over `bg` at opacity `a`. */
function mix(fg: string, bg: string, a: number) {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return toHex(f.map((v, i) => v * a + b[i] * (1 - a)));
}
function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ------------------------------------------------------------ dark palette

export const PAGE = "#0f1216";
const NEUTRALS = new Set(["gray", "slate", "zinc", "neutral", "stone"]);

/** Backgrounds: pale greys become dark surfaces; mid shades stay; near-black fills lift so they show. */
export const NEUTRAL_BG: Shades = {
  "25": "#12161b",
  "50": "#161b22",
  "100": "#1c2229",
  "200": "#262d36",
  "300": "#343b45",
  "400": "#4b5360",
  "800": "#242b34",
  "900": "#2b333d",
  "950": "#1c2229",
};
/** Text: dark greys become light ones; light shades (used on dark fills) stay. */
export const NEUTRAL_TEXT: Shades = {
  "300": "#55606d",
  "400": "#6e7682",
  "500": "#9098a6",
  "600": "#a1a8b3",
  "700": "#d1d5db",
  "800": "#e5e7eb",
  "900": "#f3f4f6",
  "950": "#f9fafb",
};
export const NEUTRAL_BORDER: Shades = {
  "25": "#232a33",
  "50": "#232a33",
  "100": "#232a33",
  "200": "#2b333d",
  "300": "#39424d",
  "400": "#4b5360",
};
/** Coloured families: how much of the colour tints a dark background / border. */
const BG_TINT: Record<string, number> = {
  "25": 0.06,
  "50": 0.1,
  "100": 0.16,
  "200": 0.24,
  "300": 0.34,
};
const BORDER_TINT: Record<string, number> = {
  "25": 0.16,
  "50": 0.16,
  "100": 0.26,
  "200": 0.4,
  "300": 0.58,
};
/** Coloured text: dark shades take the matching light shade. */
const TEXT_SHIFT: Record<string, string> = {
  "600": "400",
  "700": "300",
  "800": "200",
  "900": "100",
  "950": "50",
};

/** The original colour of a token, or null if it isn't a plain colour. */
export function lightColor(family: string, shade: string): string | null {
  if (family === "white") return "#ffffff";
  if (family === "black") return "#000000";
  const value = palette(family)?.[shade];
  return typeof value === "string" ? value : null;
}

/** The dark colour for a token, or null when it stays as it is. */
export function darkColor(
  kind: Kind,
  family: string,
  shade: string
): string | null {
  if (family === "white")
    return kind === "bg" ? PAGE : kind === "border" ? "#262d36" : null;
  if (family === "black") return kind === "text" ? "#f3f4f6" : null;
  const pal = palette(family);
  if (!pal) return null;
  if (NEUTRALS.has(family)) {
    const table =
      kind === "bg"
        ? NEUTRAL_BG
        : kind === "text"
        ? NEUTRAL_TEXT
        : NEUTRAL_BORDER;
    return table[shade] ?? null;
  }
  const base = pal["500"];
  if (!base) return null;
  if (kind === "bg") {
    const a = BG_TINT[shade];
    return a === undefined ? null : mix(base, PAGE, a);
  }
  if (kind === "border") {
    const a = BORDER_TINT[shade];
    return a === undefined ? null : mix(base, PAGE, a);
  }
  const lighter = TEXT_SHIFT[shade];
  return lighter ? pal[lighter] ?? null : null;
}

// ----------------------------------------------------------------- scanning

const UTIL_KIND: Record<string, Kind> = {
  bg: "bg",
  from: "bg",
  via: "bg",
  to: "bg",
  "ring-offset": "bg",
  text: "text",
  fill: "text",
  stroke: "text",
  placeholder: "text",
  caret: "text",
  accent: "text",
  decoration: "text",
  border: "border",
  "border-t": "border",
  "border-b": "border",
  "border-l": "border",
  "border-r": "border",
  "border-x": "border",
  "border-y": "border",
  "border-s": "border",
  "border-e": "border",
  divide: "border",
  ring: "border",
  outline: "border",
};

export type Parsed = {
  raw: string;
  variants: string[];
  important: boolean;
  util: string;
  family: string;
  shade: string;
  alpha: string | null;
};

function tokenRegex() {
  const fam = scannedFamilies().join("|");
  return new RegExp(
    String.raw`(?<![\w\-:\[\]/.])((?:[a-z0-9\-\[\]=&_>*]+:)*)(!?)(bg|text|border(?:-[trblxyse])?|divide|ring-offset|ring|outline|from|via|to|fill|stroke|placeholder|caret|accent|decoration)-(white|black|transparent|current|inherit|(?:${fam})(?:-(?:DEFAULT|\d{2,3}))?)(?:/(\d+))?(?![\w\-])`,
    "g"
  );
}

function walk(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "emails") continue;
      walk(full, out);
    } else if (
      /\.(tsx?|jsx?)$/.test(entry.name) &&
      !/\.(test|d)\.tsx?$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Every colour class used anywhere in the app. */
export function scanTokens(): Map<string, Parsed> {
  const found = new Map<string, Parsed>();
  const re = tokenRegex();
  const families = new Set(scannedFamilies());
  for (const file of walk(APP_DIR)) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(re)) {
      const [raw, variantText, bang, util, colour, alpha] = m;
      if (found.has(raw)) continue;
      let family = colour;
      let shade = "";
      const dash = colour.indexOf("-");
      if (dash > 0 && families.has(colour.slice(0, dash))) {
        family = colour.slice(0, dash);
        shade = colour.slice(dash + 1);
      } else if (families.has(colour)) {
        shade = "DEFAULT";
      }
      found.set(raw, {
        raw,
        variants: variantText.split(":").filter(Boolean),
        important: bang === "!",
        util,
        family,
        shade,
        alpha: alpha ?? null,
      });
    }
  }
  return found;
}

// ------------------------------------------------------------- generation

const BREAKPOINTS: Record<string, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};
const STATE_SUFFIX: Record<string, string> = {
  hover: ":hover",
  focus: ":focus",
  "focus-visible": ":focus-visible",
  "focus-within": ":focus-within",
  active: ":active",
  disabled: ":disabled",
  enabled: ":enabled",
  checked: ":checked",
  invalid: ":invalid",
  first: ":first-child",
  last: ":last-child",
  odd: ":nth-child(odd)",
  even: ":nth-child(even)",
  "aria-selected": '[aria-selected="true"]',
};
const PSEUDO_ELEMENT: Record<string, string> = {
  before: "::before",
  after: "::after",
  placeholder: "::placeholder",
};

const escapeClass = (s: string) =>
  s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
const cssColour = (hex: string, alpha: string | null) => {
  if (alpha === null) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${Number((Number(alpha) / 100).toFixed(2))})`;
};

function declarations(util: string, c: string): string[] {
  switch (util) {
    case "bg":
      return [`background-color: ${c}`];
    case "text":
    case "placeholder":
      return [`color: ${c}`];
    case "fill":
      return [`fill: ${c}`];
    case "stroke":
      return [`stroke: ${c}`];
    case "border":
    case "divide":
      return [`border-color: ${c}`];
    case "border-t":
      return [`border-top-color: ${c}`];
    case "border-b":
      return [`border-bottom-color: ${c}`];
    case "border-l":
      return [`border-left-color: ${c}`];
    case "border-r":
      return [`border-right-color: ${c}`];
    case "border-x":
      return [`border-left-color: ${c}`, `border-right-color: ${c}`];
    case "border-y":
      return [`border-top-color: ${c}`, `border-bottom-color: ${c}`];
    case "border-s":
      return [`border-inline-start-color: ${c}`];
    case "border-e":
      return [`border-inline-end-color: ${c}`];
    case "ring":
      return [`--tw-ring-color: ${c}`];
    case "ring-offset":
      return [`--tw-ring-offset-color: ${c}`];
    case "outline":
      return [`outline-color: ${c}`];
    case "decoration":
      return [`text-decoration-color: ${c}`];
    case "caret":
      return [`caret-color: ${c}`];
    case "accent":
      return [`accent-color: ${c}`];
    case "from": {
      const clear = c.startsWith("rgb(")
        ? c.replace(/ \/ [\d.]+\)/, " / 0)")
        : `rgb(${hexToRgb(c).join(" ")} / 0)`;
      return [
        `--tw-gradient-from: ${c} var(--tw-gradient-from-position)`,
        `--tw-gradient-to: ${clear} var(--tw-gradient-to-position)`,
        "--tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to)",
      ];
    }
    case "via": {
      const clear = c.startsWith("rgb(")
        ? c.replace(/ \/ [\d.]+\)/, " / 0)")
        : `rgb(${hexToRgb(c).join(" ")} / 0)`;
      return [
        `--tw-gradient-to: ${clear} var(--tw-gradient-to-position)`,
        `--tw-gradient-stops: var(--tw-gradient-from), ${c} var(--tw-gradient-via-position), var(--tw-gradient-to)`,
      ];
    }
    case "to":
      return [`--tw-gradient-to: ${c} var(--tw-gradient-to-position)`];
    default:
      return [];
  }
}

type Rule = {
  media: number | null;
  selector: string;
  decls: string[];
  weight: number;
};

/** Class names whose variants are handled by hand in dark-theme-extras.ts. */
export const MANUAL_TOKENS = new Set<string>([
  "[&_[cmdk-group-heading]]:text-gray-400", // command palette group headings
  "[&>div>p:first-child]:text-gray-900", // covered in dark-theme-extras.ts
  "[&>div>p:last-child]:text-gray-600", // covered in dark-theme-extras.ts
  "]:hover:bg-gray-50", // the secondary Button's hover (two arbitrary variants, in button.tsx)
]);

export type Build = {
  css: string;
  rules: number;
  tokens: number;
  /** Colour classes this couldn't turn into a rule, with the reason. */
  unsupported: Map<string, string>;
};

export function buildDarkCss(): Build {
  const tokens = scanTokens();
  const unsupported = new Map<string, string>();
  const rules = new Map<string, Rule>();

  for (const token of [...tokens.values()].sort((a, b) =>
    a.raw.localeCompare(b.raw)
  )) {
    const kind = UTIL_KIND[token.util];
    const hasVariants = token.variants.length > 0;

    // The colour values, original and dark
    let original: string | null;
    let dark: string | null;
    if (["transparent", "current", "inherit"].includes(token.family)) {
      original = dark =
        token.family === "current" ? "currentColor" : token.family;
      if (["from", "via", "to"].includes(token.util)) continue; // gradients to nothing stay as they are
    } else {
      // A shade the palette doesn't have (e.g. text-gray): no such class, so nothing to do
      if (token.shade === "DEFAULT" && !palette(token.family)?.DEFAULT)
        continue;
      original = lightColor(token.family, token.shade);
      dark =
        original === null ? null : darkColor(kind, token.family, token.shade);
      if (original === null) {
        unsupported.set(
          token.raw,
          `unknown colour ${token.family}-${token.shade}`
        );
        continue;
      }
    }
    // Plain classes only need a rule when their colour changes
    if (!hasVariants && dark === null) continue;
    const value = dark ?? original;
    if (value === null) continue;
    const colour = ["transparent", "currentColor", "inherit"].includes(value)
      ? value
      : cssColour(value, token.alpha);

    // The selector, from the variants
    let media: number | null = null;
    let groupPrefix = "";
    const states: string[] = [];
    const pseudos: string[] = [];
    let bad: string | null = null;
    for (const v of token.variants) {
      if (BREAKPOINTS[v]) media = Math.max(media ?? 0, BREAKPOINTS[v]);
      else if (STATE_SUFFIX[v]) states.push(STATE_SUFFIX[v]);
      else if (PSEUDO_ELEMENT[v]) pseudos.push(PSEUDO_ELEMENT[v]);
      else if (/^data-\[([\w-]+)=([\w-]+)\]$/.test(v)) {
        const [, k, val] = v.match(/^data-\[([\w-]+)=([\w-]+)\]$/)!;
        states.push(`[data-${k}="${val}"]`);
      } else if (v === "group-hover") groupPrefix = ".group:hover ";
      else bad = `variant "${v}"`;
    }
    if (bad) {
      unsupported.set(token.raw, bad);
      continue;
    }
    let selector = `${groupPrefix}.${escapeClass(token.raw)}${states.join("")}`;
    if (token.util === "divide")
      selector += " > :not([hidden]) ~ :not([hidden])";
    selector += pseudos.join("");
    if (token.util === "placeholder" && !pseudos.includes("::placeholder"))
      selector += "::placeholder";

    const decls = declarations(token.util, colour).map((d) =>
      token.important ? `${d} !important` : d
    );
    const key = `${media ?? ""}|${selector}`;
    const existing = rules.get(key);
    if (existing) existing.decls.push(...decls);
    else
      rules.set(key, {
        media,
        selector: `html.dark ${selector}`,
        decls,
        weight: states.length + pseudos.length + (groupPrefix ? 1 : 0),
      });
  }

  const sorted = [...rules.values()].sort(
    (a, b) =>
      (a.media ?? 0) - (b.media ?? 0) ||
      a.weight - b.weight ||
      a.selector.localeCompare(b.selector)
  );
  const lines: string[] = [];
  const format = (r: Rule, pad: string) =>
    `${pad}${r.selector} { ${[...new Set(r.decls)].join("; ")}; }`;
  for (const r of sorted.filter((r) => r.media === null))
    lines.push(format(r, ""));
  for (const bp of [
    ...new Set(
      sorted.map((r) => r.media).filter((m): m is number => m !== null)
    ),
  ]) {
    lines.push(`@media (min-width: ${bp}px) {`);
    for (const r of sorted.filter((r) => r.media === bp))
      lines.push(format(r, "  "));
    lines.push("}");
  }

  const css = [
    "/* Fork (VinneyUK/shelf.nu): dark theme.",
    "   GENERATED by scripts/dark-theme.ts: do not edit by hand. Change the palette in",
    "   that script (or the hand-written part in scripts/dark-theme-extras.ts) and run",
    "   `npx tsx scripts/dark-theme.ts`. app/styles/dark-theme.test.ts checks it. */",
    "",
    "/* ---- every colour class in the app ---- */",
    ...lines,
    "",
    EXTRAS.trim(),
    "",
  ].join("\n");
  return { css, rules: sorted.length, tokens: tokens.size, unsupported };
}

// ---------------------------------------------------------------------- CLI

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { css, rules, tokens, unsupported } = buildDarkCss();
  fs.writeFileSync(OUT_FILE, css);
  console.log(
    `${OUT_FILE}: ${tokens} colour classes found, ${rules} rules written`
  );
  const missing = [...unsupported].filter(([raw]) => !MANUAL_TOKENS.has(raw));
  if (missing.length) {
    console.log(
      `\n${missing.length} classes need handling (add to dark-theme-extras.ts, then to MANUAL_TOKENS):`
    );
    for (const [raw, why] of missing) console.log(`  ${raw}   (${why})`);
    process.exitCode = 1;
  }
}
