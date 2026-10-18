/**
 * A replica of a printed filament label, drawn from the same layout rules the
 * printer uses (modules/labels/layout.ts) in the printer's own font, with a
 * real, scannable QR code. Part of the labels feature; not in upstream Shelf.
 */
import { useMemo } from "react";
import {
  codeBoxWidth,
  filamentLabelParts,
  LABEL_HEIGHT,
  QR_SIZE,
  type FilamentLabelContent,
  type LabelLayoutSettings,
} from "~/modules/labels/layout";
import { tw } from "~/utils/tw";
import { qrPath } from "./label-preview";

const INK = "#101828";
const FONT = `"Shelf Label", "Poppins", ui-sans-serif, system-ui, sans-serif`;

export function FilamentLabelPreview({
  content,
  settings,
  scale = 1.25,
  className,
}: {
  content: FilamentLabelContent;
  settings: LabelLayoutSettings;
  /** Screen pixels per printer dot */
  scale?: number;
  className?: string;
}) {
  const qr = useMemo(() => qrPath(content.qrUrl), [content.qrUrl]);
  const parts = filamentLabelParts(content, settings);
  const { left, right } = parts.area;
  const m = settings.leftMargin;
  const code = parts.code;
  // the code's box, the same width the printer draws
  const codeWidth = code ? codeBoxWidth(code.value) : 0;
  const codeLeft = code ? (code.alignRight ? right - codeWidth : left) : 0;

  return (
    <svg
      role="img"
      aria-label={`Label for ${content.filamentId}: ${content.colour}, ${content.line}`}
      viewBox={`0 0 ${settings.labelWidth} ${LABEL_HEIGHT}`}
      width={settings.labelWidth * scale}
      height={LABEL_HEIGHT * scale}
      className={tw(
        "h-auto shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm",
        className
      )}
      data-keep-light
      style={{ backgroundColor: "#ffffff" }}
    >
      <rect width={settings.labelWidth} height={LABEL_HEIGHT} fill="#fff" />
      <svg
        x={2 + m}
        y={1}
        width={QR_SIZE}
        height={QR_SIZE}
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <rect width={qr.size} height={qr.size} fill="#fff" />
        <path d={qr.d} fill={INK} />
      </svg>
      <g fontFamily={FONT} fontWeight={700} fill={INK}>
        <text x={left} y={parts.id.baseline} fontSize={parts.id.size}>
          {parts.id.value}
        </text>
        {code ? (
          <>
            <rect
              x={codeLeft}
              y={code.top}
              width={codeWidth}
              height={19}
              rx={3}
              fill={INK}
            />
            <text
              x={codeLeft + codeWidth / 2}
              y={code.top + 15}
              fontSize={15}
              textAnchor="middle"
              fill="#fff"
            >
              {code.value}
            </text>
          </>
        ) : null}
        {parts.colour.lines.map((line, i) => (
          <text
            key={i}
            x={left}
            y={parts.colour.baselines[i]}
            fontSize={parts.colour.size}
          >
            {line}
          </text>
        ))}
        {parts.line ? (
          <text x={left} y={parts.line.baseline} fontSize={parts.line.size}>
            {parts.line.value}
          </text>
        ) : null}
      </g>
    </svg>
  );
}
