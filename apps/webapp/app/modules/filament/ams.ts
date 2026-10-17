/**
 * The AMS, as the printer reports it (fork, pure): each slot's tag, line,
 * colour and how much is left, from a Bambu printer's MQTT report.
 */
import { cleanHex, coloursFor } from "./catalogue";

export type Tray = {
  /** 1 to 4 */
  slot: number;
  /**
   * The spool's identity: its spool ID (tray_uuid), which is the same whichever
   * of its two RFID tags the AMS reads; the tag's own ID when there's no spool
   * ID. Kept in Spool.tagUid.
   */
  tagUid: string;
  /** The ID of the tag that was read (each spool has two: slots 1 and 3 read one side, 2 and 4 the other) */
  rawTag: string;
  /** Bambu's line, e.g. "PLA Basic" */
  type: string;
  colourHex: string;
  /** Bambu's colour name, when its catalogue has this shade for the line */
  colourName: string | null;
  remainingPercent: number;
  weightGrams: number;
};

type RawTray = {
  id?: string | number;
  tag_uid?: string;
  tray_uuid?: string;
  tray_type?: string;
  tray_sub_brands?: string;
  tray_color?: string;
  remain?: number;
  tray_weight?: string | number;
};

/** A tag of all zeros means no RFID tag: a third-party spool, which Shelf leaves alone. */
const NO_TAG = /^0*$/;

/**
 * The loaded, tagged slots in a report; empty slots and untagged spools are
 * left out. Bambu's colour is RRGGBBAA; the name comes from the catalogue
 * when the shade matches.
 */
export function traysInReport(report: unknown): Tray[] {
  const units = (
    report as { print?: { ams?: { ams?: { tray?: RawTray[] }[] } } }
  )?.print?.ams?.ams;
  if (!Array.isArray(units)) return [];
  const trays: Tray[] = [];
  for (const unit of units) {
    for (const t of unit.tray ?? []) {
      const rawTag = (t.tag_uid ?? "").trim().toUpperCase();
      const spoolId = (t.tray_uuid ?? "").trim().toUpperCase();
      const tagUid = spoolId && !NO_TAG.test(spoolId) ? spoolId : rawTag;
      const type = (t.tray_sub_brands || t.tray_type || "").trim();
      if (!rawTag || NO_TAG.test(rawTag) || !type) continue;
      const hex = cleanHex(`#${(t.tray_color ?? "").slice(0, 6)}`);
      if (!hex) continue;
      const slot = Number(t.id);
      if (!(slot >= 0 && slot <= 3)) continue;
      const remain = Number(t.remain);
      const weight = Number(t.tray_weight);
      trays.push({
        slot: slot + 1,
        tagUid,
        rawTag,
        type,
        colourHex: hex,
        colourName: colourNameFor(type, hex),
        remainingPercent:
          Number.isFinite(remain) && remain >= 0
            ? Math.min(100, Math.round(remain))
            : 100,
        weightGrams:
          Number.isFinite(weight) && weight > 0 ? Math.round(weight) : 1000,
      });
    }
  }
  return trays;
}

/** Bambu's name for a shade of a line, when the catalogue has it (exact hex). */
export function colourNameFor(type: string, hex: string): string | null {
  const h = hex.toUpperCase();
  return (
    coloursFor(type).find(
      ([, colourHex]) => colourHex.toUpperCase() === h
    )?.[0] ?? null
  );
}

/** True when two readings of the AMS say the same thing. */
export function sameTrays(a: Tray[], b: Tray[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}
