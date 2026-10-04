/**
 * A replica of a printed label, drawn from the same layout rules the printer
 * uses (modules/labels/layout.ts), with a real, scannable QR code.
 * Part of the labels feature; not in upstream Shelf.
 */
import { useMemo } from "react";
import QRCode from "qrcode-generator";
import {
  LABEL_HEIGHT,
  QR_SIZE,
  labelTitle,
  titleStyle,
  type LabelLayoutSettings,
} from "~/modules/labels/layout";
import { tw } from "~/utils/tw";

/** One SVG path for the dark modules, plus the grid size including a 1-module border. */
function qrPath(data: string) {
  const code = QRCode(0, "L");
  code.addData(data);
  code.make();
  const n = code.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (code.isDark(r, c)) d += `M${c + 1} ${r + 1}h1v1h-1z`;
    }
  }
  return { d, size: n + 2 };
}

export function LabelPreview({
  sequentialId,
  title,
  qrUrl,
  settings,
  scale = 1.25,
  className,
}: {
  sequentialId: string;
  title: string;
  qrUrl: string;
  settings: LabelLayoutSettings;
  /** Screen pixels per printer dot */
  scale?: number;
  className?: string;
}) {
  const qr = useMemo(() => qrPath(qrUrl), [qrUrl]);
  const m = settings.leftMargin;
  const { size } = titleStyle(settings);
  const px = (dots: number) => `${dots * scale}px`;

  return (
    <div
      role="img"
      aria-label={`Label for ${sequentialId || "asset"}: ${title}`}
      className={tw(
        "relative shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white text-gray-900 shadow-sm",
        className
      )}
      data-keep-light
      style={{
        width: px(settings.labelWidth),
        height: px(LABEL_HEIGHT),
        backgroundColor: "#ffffff",
        color: "#101828",
      }}
    >
      <svg
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        shapeRendering="crispEdges"
        className="absolute"
        style={{
          left: px(2 + m),
          top: px(1),
          width: px(QR_SIZE),
          height: px(QR_SIZE),
        }}
        aria-hidden="true"
      >
        <rect width={qr.size} height={qr.size} fill="#fff" />
        <path d={qr.d} fill="#101828" />
      </svg>
      <div
        className="absolute whitespace-nowrap font-bold leading-none"
        style={{ left: px(102 + m), top: px(4), fontSize: px(16) }}
      >
        {sequentialId}
      </div>
      <div
        className="absolute line-clamp-3 font-bold"
        style={{
          left: px(102 + m),
          top: px(27),
          width: px(settings.labelWidth - 106 - m),
          fontSize: px(size),
          lineHeight: 1.1,
          overflowWrap: "anywhere",
        }}
      >
        {labelTitle(title, settings)}
      </div>
    </div>
  );
}
