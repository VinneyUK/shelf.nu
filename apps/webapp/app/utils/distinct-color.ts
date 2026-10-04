/**
 * Fork: colours for categories and tags that are easy to tell apart. Instead of
 * a random hex, the next colour takes the hue furthest from every colour already
 * in use, at a saturation and lightness that read well as a badge.
 */

export function hexToHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null; // grey: no hue
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/**
 * The hue (0–360) with the biggest gap to every hue already in use: the middle
 * of the largest empty arc on the colour wheel. With nothing in use, a fixed
 * starting hue so the first pick is predictable.
 */
export function mostDistinctHue(usedHues: number[], seed = 24): number {
  const hues = [...new Set(usedHues.map((h) => ((h % 360) + 360) % 360))].sort(
    (a, b) => a - b
  );
  if (hues.length === 0) return seed;
  if (hues.length === 1) return (hues[0] + 180) % 360;
  let bestStart = hues[hues.length - 1];
  let bestGap = hues[0] + 360 - hues[hues.length - 1];
  for (let i = 0; i < hues.length - 1; i++) {
    const gap = hues[i + 1] - hues[i];
    if (gap > bestGap) {
      bestGap = gap;
      bestStart = hues[i];
    }
  }
  return (bestStart + bestGap / 2) % 360;
}

/** A badge colour as far as possible from the ones given (hex strings; invalid ones ignored). */
export function distinctColor(usedHexes: string[]): string {
  const hues = usedHexes.map(hexToHue).filter((h): h is number => h !== null);
  return hslToHex(mostDistinctHue(hues), 0.62, 0.5);
}
