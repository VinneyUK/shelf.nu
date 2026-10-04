/**
 * Fork vocabulary: words Shelf uses that this workspace calls something else.
 * "Kit" is "Box" here. Pure rules, so they're easy to test.
 */

/** Keeps the capitalisation of the word being replaced. */
function matchCase(from: string, to: string) {
  if (from === from.toUpperCase()) return to.toUpperCase();
  if (from[0] === from[0].toUpperCase())
    return to[0].toUpperCase() + to.slice(1);
  return to;
}

const RULES: { pattern: RegExp; one: string; many: string }[] = [
  { pattern: /\b(kit)(s?)\b/gi, one: "box", many: "boxes" },
];

/** "Add to kit" → "Add to box", "Kits" → "Boxes", "KIT" → "BOX". */
export function applyVocabulary(text: string): string {
  let out = text;
  for (const { pattern, one, many } of RULES) {
    out = out.replace(pattern, (_m, word: string, plural: string) =>
      matchCase(word, plural ? many : one)
    );
  }
  return out;
}

/** Elements whose text is the user's own, or code: never rewritten. */
export const VOCABULARY_SKIP_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "script",
  "style",
  "code",
  "pre",
  "[contenteditable]",
  "[data-vocabulary-skip]",
  'a[href^="/assets/"]', // asset names in lists
  'a[href^="/kits/"] .font-medium', // kit names in lists
].join(",");
