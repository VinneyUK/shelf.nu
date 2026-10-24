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
import { type DotLogo, MATTER_LOGOS } from "~/modules/matter/logo";
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

/** The Matter logo as printer dots: a filled rectangle for each run of black dots. */
function matterLogo(logo: DotLogo, left: number, top: number) {
  return logo.runs.map(([row, from, to]) => ({
    type: "rectangle",
    x_start: left + from,
    y_start: top + row,
    x_end: left + to + 1,
    y_end: top + row + 1,
    fill: "black",
    outline: "black",
    width: 0,
  }));
}

/** Where the logo sits: beside the QR, a little down from its top. */
export const MATTER_LOGO_TOP = 6;

/**
 * A Matter label: the device's Matter QR at the left (for a Home app to scan),
 * the Matter logo beside it near the top, and under the logo the code and the
 * device's name, one beneath the other, each sized down (then cut) to fit the
 * label width set in Labels → Settings.
 */
export function matterLabelPayload(
  content: MatterLabelContent,
  settings: LabelLayoutSettings
) {
  const m = settings.leftMargin;
  const qrLeft = 2 + m;
  const left = content.payload ? qrLeft + QR_SIZE + 6 : qrLeft;
  const room = Math.max(10, settings.labelWidth - left - 4);
  const codeSize = fitMatterSize(content.matterCode, room, 22, 11);
  const nameSize = fitMatterSize(content.name, room, 15, 10);
  // the largest logo that fits beside the QR
  const logo =
    MATTER_LOGOS.find((l) => l.width <= room) ??
    MATTER_LOGOS[MATTER_LOGOS.length - 1];
  const textTop = MATTER_LOGO_TOP + logo.height;
  return [
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
    ...matterLogo(logo, left, MATTER_LOGO_TOP),
    text(
      cutToFit(content.matterCode, room, codeSize),
      left,
      textTop + 25,
      codeSize
    ),
    text(cutToFit(content.name, room, nameSize), left, textTop + 47, nameSize),
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
