/**
 * How wide Poppins Bold is, the font the Niimbot integration prints labels in
 * (its ppb.ttf), so the server can size text to fit before it is drawn.
 * Advance widths in font units (1000 to the em), from the font file itself.
 * Part of the labels feature; not in upstream Shelf.
 *
 * Poppins: Copyright 2020 The Poppins Project Authors, SIL Open Font License 1.1.
 */

/** U+0020 to U+007E */
const ASCII = [
  212, 392, 411, 904, 658, 870, 798, 221, 477, 477, 534, 628, 287, 580, 282,
  453, 652, 376, 571, 605, 677, 650, 637, 535, 648, 615, 284, 347, 551, 696,
  541, 538, 1080, 737, 659, 762, 727, 541, 547, 762, 731, 295, 578, 697, 477,
  918, 752, 786, 624, 788, 652, 615, 591, 705, 730, 1052, 715, 671, 596, 510,
  802, 510, 709, 780, 291, 679, 679, 605, 679, 616, 360, 679, 674, 295, 294,
  618, 295, 1059, 674, 637, 679, 679, 428, 558, 406, 674, 626, 866, 588, 632,
  496, 499, 291, 499, 636,
];

/** U+00A0 to U+00FF */
const LATIN_1 = [
  212, 392, 631, 663, 577, 671, 381, 587, 367, 779, 469, 557, 717, 580, 514,
  420, 463, 629, 383, 374, 261, 705, 708, 299, 313, 249, 458, 557, 786, 821,
  891, 538, 737, 737, 737, 737, 737, 737, 955, 762, 541, 541, 541, 541, 295,
  295, 295, 295, 732, 752, 786, 786, 786, 786, 786, 637, 786, 705, 705, 705,
  705, 671, 624, 760, 679, 679, 679, 679, 679, 679, 1069, 605, 616, 616, 616,
  616, 321, 321, 321, 321, 640, 674, 637, 637, 637, 637, 637, 611, 629, 674,
  674, 674, 674, 632, 679, 632,
];

/** For anything else: a wide-ish letter, so text errs on the small side. */
const FALLBACK = 700;

export const ASCENT = 1.05;

function advance(code: number) {
  if (code >= 0x20 && code <= 0x7e) return ASCII[code - 0x20];
  if (code >= 0xa0 && code <= 0xff) return LATIN_1[code - 0xa0];
  return FALLBACK;
}

/** The width of `text` at `size` dots, in dots. */
export function textWidth(text: string, size: number) {
  let units = 0;
  for (const ch of text) units += advance(ch.codePointAt(0) ?? 0);
  return (units * size) / 1000;
}

/**
 * The largest size from `max` down to `min` at which `text` fits `width`, or
 * `min` if it never does.
 */
export function fitSize(text: string, width: number, max: number, min: number) {
  for (let size = max; size > min; size--) {
    if (textWidth(text, size) <= width) return size;
  }
  return min;
}

/** `text` cut short with "…" so it fits `width` at `size`. */
export function fitText(text: string, width: number, size: number) {
  if (textWidth(text, size) <= width) return text;
  const chars = [...text];
  while (chars.length > 1) {
    chars.pop();
    const cut = `${chars.join("").trimEnd()}…`;
    if (textWidth(cut, size) <= width) return cut;
  }
  return "…";
}

/**
 * `text` on up to `maxLines` lines, word-wrapped, at the largest size from
 * `max` down to `min` where every line fits `width`. If nothing fits even at
 * `min`, the last line is cut short with "…".
 */
export function wrapToFit(
  text: string,
  width: number,
  max: number,
  min: number,
  maxLines: number
): { lines: string[]; size: number } {
  const words = text.split(/\s+/).filter(Boolean);
  const wrap = (size: number) => {
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (!current || textWidth(next, size) <= width) current = next;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };
  for (let size = max; size >= min; size--) {
    const lines = wrap(size);
    if (
      lines.length <= maxLines &&
      lines.every((l) => textWidth(l, size) <= width)
    )
      return { lines, size };
  }
  const lines = wrap(min);
  const kept = lines.slice(0, maxLines);
  const rest = lines.slice(maxLines - 1).join(" ");
  kept[kept.length - 1] = fitText(rest, width, min);
  return {
    lines: kept.map((l) => fitText(l, width, min)),
    size: min,
  };
}
