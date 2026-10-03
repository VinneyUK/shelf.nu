/**
 * Label layout, shared by the printer and the on-screen previews so they can
 * never disagree. Part of the labels feature; not in upstream Shelf.
 *
 * The label is drawn landscape at `width` × 96 dots (96 dots is the D110's
 * 12 mm printhead) and rotated for printing: QR code on the left, the asset ID
 * along the top, the name underneath on up to three lines.
 */

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

/** The whole request body for POST /api/services/niimbot/print. */
export function printRequestBody(
  content: LabelContent,
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
    payload: labelPayload(content, settings),
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
