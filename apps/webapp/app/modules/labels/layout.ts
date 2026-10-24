/**
 * Label layout, shared by the printer and the on-screen previews so they can
 * never disagree. Part of the labels feature; not in upstream Shelf.
 *
 * The label is drawn landscape at `width` × 96 dots (96 dots is the D110's
 * 12 mm printhead) and rotated for printing: QR code on the left, the asset ID
 * along the top, the name underneath on up to three lines.
 *
 * Filament labels: QR code on the left; FIL-0001 along the top with the Bambu
 * code printed white on black at the right; the colour, large; the line.
 */
import { fitSize, fitText, textWidth, wrapToFit } from "./font-metrics";

export const LABEL_HEIGHT = 96;
export const QR_SIZE = 93;

export type LabelLayoutSettings = {
  labelWidth: number;
  leftMargin: number;
};

export type LabelContent = {
  sequentialId: string;
  title: string;
  /** The link the QR code opens */
  qrUrl: string;
};

/** Shorter labels get slightly smaller text so more of the name fits. */
export function titleStyle({ labelWidth, leftMargin }: LabelLayoutSettings) {
  if (labelWidth >= 300) return { size: 20, maxChars: 40 };
  return {
    size: 18,
    maxChars: Math.floor(((labelWidth - 106 - leftMargin) * 30) / 134),
  };
}

/** The name as printed: whitespace tidied, long names cut short with "…". */
export function labelTitle(title: string, settings: LabelLayoutSettings) {
  const clean = title.replace(/\s+/g, " ").trim();
  const { maxChars } = titleStyle(settings);
  return clean.length > maxChars
    ? `${clean.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
    : clean;
}

/** The drawing instructions for Home Assistant's niimbot.print. */
export function labelPayload(
  content: LabelContent,
  settings: LabelLayoutSettings
) {
  const m = settings.leftMargin;
  const { size } = titleStyle(settings);
  return [
    {
      type: "qrcode",
      data: content.qrUrl,
      x: 2 + m,
      y: 1,
      boxsize: 3,
      border: 1,
      eclevel: "l",
      // Longer links are scaled to fit the printhead
      width: QR_SIZE,
      height: QR_SIZE,
    },
    {
      type: "text",
      value: content.sequentialId,
      x: 102 + m,
      y: 4,
      size: 16,
      font: "ppb.ttf",
    },
    {
      type: "text",
      value: labelTitle(content.title, settings),
      x: 102 + m,
      y: 27,
      size,
      spacing: 2,
      max_width: settings.labelWidth - 106 - m,
      font: "ppb.ttf",
    },
  ];
}

export type FilamentLabelContent = {
  /** FIL-0001 */
  filamentId: string;
  /** "Jade White" */
  colour: string;
  /** "PLA Basic" */
  line: string;
  /** The Bambu code from the box, e.g. "10100"; none leaves its place empty */
  boxCode: string | null;
  qrUrl: string;
};

/** Where the text starts and stops, in dots. */
function textArea({ labelWidth, leftMargin }: LabelLayoutSettings) {
  const left = 102 + leftMargin;
  const right = labelWidth - 4;
  return { left, right, width: right - left };
}

/** Narrower than this, the code can't sit beside the number. */
const NARROW = 200;

/** Space either side of the code inside its box, and between it and the number. */
const CODE_PADDING = 4;
const CODE_GAP = 4;

/** How wide the Bambu code's box is. */
export function codeBoxWidth(code: string) {
  return Math.ceil(textWidth(code, 15)) + CODE_PADDING * 2;
}

/** The Bambu code: a black box sized to it, the code in white. */
function codeBox(code: string, x: number, top: number, alignRight: boolean) {
  const size = 15;
  const width = codeBoxWidth(code);
  const left = alignRight ? x - width : x;
  return [
    {
      type: "rectangle",
      x_start: left,
      y_start: top,
      x_end: left + width,
      y_end: top + 19,
      fill: "black",
      outline: "black",
      width: 1,
      radius: 3,
    },
    {
      type: "text",
      value: code,
      x: left + width / 2,
      y: top + 15,
      size,
      color: "white",
      anchor: "ms",
      font: "ppb.ttf",
    },
  ];
}

const text = (value: string, x: number, baseline: number, size: number) => ({
  type: "text",
  value,
  x,
  y: baseline,
  size,
  anchor: "ls",
  font: "ppb.ttf",
});

/** The line on 12 × 22 mm, shrunk a little before it's cut short. */
function narrowLine(line: string, width: number) {
  const size = fitSize(line, width, 14, 11);
  return { value: fitText(line, width, size), size, baseline: 80 };
}

/** What a filament label's text works out as, for the printer and the preview. */
export function filamentLabelParts(
  content: FilamentLabelContent,
  settings: LabelLayoutSettings
) {
  const area = textArea(settings);
  const tidy = (v: string) => v.replace(/\s+/g, " ").trim();
  const colour = tidy(content.colour);
  const line = tidy(content.line);
  const code = content.boxCode?.trim() || null;
  // the code goes beside the number when both fit, with a little gap
  const besideFits =
    !code ||
    textWidth(content.filamentId, 16) +
      CODE_GAP +
      textWidth(code, 15) +
      CODE_PADDING * 2 <=
      area.width;
  if (settings.labelWidth < NARROW || !besideFits) {
    // 12 × 22 mm (or a code too long to sit beside the number): the code
    // takes the bottom row instead of the line
    const idSize = fitSize(content.filamentId, area.width, 16, 12);
    // the colour on one line if it fits at a readable size, else on two
    const oneLine = fitSize(colour, area.width, 21, 15);
    const wrapped =
      textWidth(colour, oneLine) <= area.width
        ? { lines: [colour], size: oneLine }
        : wrapToFit(colour, area.width, 17, 11, 2);
    return {
      narrow: true,
      area,
      id: { value: content.filamentId, size: idSize, baseline: 19 },
      colour: {
        lines: wrapped.lines,
        size: wrapped.size,
        baselines:
          wrapped.lines.length > 1
            ? [22 + wrapped.size, 22 + wrapped.size * 2 + 2]
            : [47],
      },
      line: code ? null : narrowLine(line, area.width),
      code: code ? { value: code, top: 66, alignRight: false } : null,
    };
  }
  const large = settings.labelWidth >= 300;
  const colourSize = fitSize(colour, area.width, large ? 28 : 25, 13);
  return {
    narrow: false,
    area,
    id: { value: content.filamentId, size: 16, baseline: 19 },
    colour: {
      lines: [fitText(colour, area.width, colourSize)],
      size: colourSize,
      baselines: [large ? 58 : 55],
    },
    line: {
      value: fitText(line, area.width, 15),
      size: 15,
      baseline: large ? 79 : 76,
    },
    code: code ? { value: code, top: 3, alignRight: true } : null,
  };
}

/** The drawing instructions for a filament label. */
export function filamentLabelPayload(
  content: FilamentLabelContent,
  settings: LabelLayoutSettings
) {
  const p = filamentLabelParts(content, settings);
  const { left, right } = p.area;
  return [
    {
      type: "qrcode",
      data: content.qrUrl,
      x: 2 + settings.leftMargin,
      y: 1,
      boxsize: 3,
      border: 1,
      eclevel: "l",
      width: QR_SIZE,
      height: QR_SIZE,
    },
    text(p.id.value, left, p.id.baseline, p.id.size),
    ...(p.code
      ? codeBox(
          p.code.value,
          p.code.alignRight ? right : left,
          p.code.top,
          p.code.alignRight
        )
      : []),
    ...p.colour.lines.map((value, i) =>
      text(value, left, p.colour.baselines[i], p.colour.size)
    ),
    ...(p.line ? [text(p.line.value, left, p.line.baseline, p.line.size)] : []),
  ];
}

/** A Matter device's label (fork): what goes on it. */
export type MatterLabelContent = {
  /** "3497-011-2332" */
  matterCode: string;
  /** The device: "Eve Energy", or the asset's name */
  name: string;
  /** The QR's "MT:…" text; null when only the manual code is known */
  payload: string | null;
};

/** The black band down the left, with the Matter mark in it. */
export const MATTER_BAND = 26;

/** The biggest size, from max down to min, at which the text fits the room. */
export function fitMatterSize(
  value: string,
  room: number,
  max: number,
  min: number
) {
  for (let size = max; size > min; size--)
    if (textWidth(value, size) <= room) return size;
  return min;
}

/** Text cut with "…" so it fits the room at that size. */
export function cutToFit(value: string, room: number, size: number) {
  if (textWidth(value, size) <= room) return value;
  let v = value;
  while (v.length > 1 && textWidth(`${v}…`, size) > room) v = v.slice(0, -1);
  return `${v.trimEnd()}…`;
}

/**
 * The Matter mark in white on the band: a stem and two arms meeting, a dot
 * at each end (lines and circles, as the printer draws them).
 */
function matterMark(cx: number, cy: number) {
  const top = { x: cx, y: cy - 13 };
  const mid = { x: cx, y: cy - 1 };
  const left = { x: cx - 9, y: cy + 10 };
  const right = { x: cx + 9, y: cy + 10 };
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    type: "line",
    x_start: a.x,
    y_start: a.y,
    x_end: b.x,
    y_end: b.y,
    fill: "white",
    width: 3,
  });
  const dot = (p: { x: number; y: number }) => ({
    type: "circle",
    x: p.x,
    y: p.y,
    radius: 3,
    fill: "white",
    outline: "white",
    width: 1,
  });
  return [
    line(top, mid),
    line(mid, left),
    line(mid, right),
    dot(top),
    dot(left),
    dot(right),
  ];
}

/**
 * A Matter label (design C): a black band with the Matter mark, the device's
 * Matter QR (for a Home app to scan), then the manual code large and the
 * device's name, each sized down (then cut) to fit the label you've set.
 */
export function matterLabelPayload(
  content: MatterLabelContent,
  settings: LabelLayoutSettings
) {
  const m = settings.leftMargin;
  const qrLeft = MATTER_BAND + 4 + m;
  const left = content.payload ? qrLeft + QR_SIZE + 6 : qrLeft;
  const room = Math.max(10, settings.labelWidth - left - 4);
  const codeSize = fitMatterSize(content.matterCode, room, 24, 11);
  const nameSize = fitMatterSize(content.name, room, 16, 11);
  return [
    {
      type: "rectangle",
      x_start: m,
      y_start: 0,
      x_end: MATTER_BAND + m,
      y_end: LABEL_HEIGHT,
      fill: "black",
      outline: "black",
      width: 1,
    },
    ...matterMark(m + MATTER_BAND / 2, LABEL_HEIGHT / 2),
    ...(content.payload
      ? [
          {
            type: "qrcode",
            data: content.payload,
            x: qrLeft,
            y: 1,
            boxsize: 3,
            border: 1,
            eclevel: "m",
            width: QR_SIZE,
            height: QR_SIZE,
          },
        ]
      : []),
    text(cutToFit(content.matterCode, room, codeSize), left, 46, codeSize),
    text(cutToFit(content.name, room, nameSize), left, 74, nameSize),
  ];
}

/** The whole request body for POST /api/services/niimbot/print. */
export function printRequestBody(
  content: LabelContent | FilamentLabelContent | MatterLabelContent,
  settings: LabelLayoutSettings & {
    deviceId: string;
    rotate: number;
    density: number | null;
  },
  options: { preview?: boolean } = {}
) {
  return {
    device_id: settings.deviceId,
    rotate: settings.rotate,
    width: settings.labelWidth,
    height: LABEL_HEIGHT,
    preview: options.preview ?? false,
    payload:
      "matterCode" in content
        ? matterLabelPayload(content, settings)
        : "filamentId" in content
        ? filamentLabelPayload(content, settings)
        : labelPayload(content, settings),
    ...(settings.density ? { density: settings.density } : {}),
  };
}

/** Label sizes offered in the settings, as length in dots. */
export const LABEL_SIZE_PRESETS = [
  { label: "12 × 22 mm", width: 176 },
  { label: "12 × 30 mm / 15 × 30 mm", width: 240 },
  { label: "12 × 40 mm / 14 × 40 mm", width: 320 },
  { label: "15 × 50 mm", width: 400 },
] as const;
