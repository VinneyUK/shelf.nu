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

// ------------------------------------------------- the printer's status (fork)

export type PrinterState = "idle" | "printing" | "paused" | "error" | "offline";

/** What's in an AMS slot, tagged or not: the status bar shows both. */
export type SlotReport = {
  /** 1 to 4 */
  slot: number;
  /** "#RRGGBB", or null when the slot is empty */
  colourHex: string | null;
  /** Bambu's line or material, e.g. "PLA Basic" */
  type: string | null;
  /** 0 to 100, or null when the AMS can't tell (no RFID tag) */
  remainingPercent: number | null;
};

/** The parts of a report the status bar uses; anything a report leaves out is unchanged. */
export type StatusReport = {
  state?: PrinterState;
  /** The slot feeding the extruder (1 to 4), null for none or the external spool */
  activeSlot?: number | null;
  slots?: SlotReport[];
  /** Health messages, as Bambu's codes ("0700_2000_0002_0001") */
  hms?: string[];
  /** The job: its name, how far through, minutes left, and layers */
  jobName?: string | null;
  percent?: number | null;
  minutesLeft?: number | null;
  layer?: number | null;
  layers?: number | null;
};

const STATES: Record<string, PrinterState> = {
  IDLE: "idle",
  FINISH: "idle",
  PREPARE: "printing",
  SLICING: "printing",
  RUNNING: "printing",
  PAUSE: "paused",
  FAILED: "error",
};

const hex4 = (n: number) =>
  (n >>> 0).toString(16).toUpperCase().padStart(8, "0");

/**
 * The printer's state, the slot in use, every slot's filament and its health
 * messages from one report. Printers send the whole picture once, then only
 * what changed, so a field that isn't in this report is left out.
 */
export function statusInReport(report: unknown): StatusReport {
  const print = (report as { print?: Record<string, unknown> })?.print;
  if (!print || typeof print !== "object") return {};
  const out: StatusReport = {};
  const gcode = print.gcode_state;
  if (typeof gcode === "string" && STATES[gcode.toUpperCase()])
    out.state = STATES[gcode.toUpperCase()];
  const ams = print.ams as
    | { tray_now?: string | number; ams?: { tray?: RawTray[] }[] }
    | undefined;
  if (ams && ams.tray_now !== undefined) {
    const now = Number(ams.tray_now);
    // 255: nothing loaded; 254: the external spool
    out.activeSlot = now >= 0 && now <= 3 ? now + 1 : null;
  }
  const unit = Array.isArray(ams?.ams) ? ams?.ams?.[0] : undefined;
  if (unit && Array.isArray(unit.tray)) {
    const slots: SlotReport[] = [];
    for (let i = 0; i < 4; i++) {
      const t = unit.tray.find((x) => Number(x.id) === i);
      const type = (t?.tray_sub_brands || t?.tray_type || "").trim();
      const hex = t?.tray_color
        ? cleanHex(`#${t.tray_color.slice(0, 6)}`)
        : null;
      const remain = Number(t?.remain);
      slots.push({
        slot: i + 1,
        colourHex: type && hex ? hex : null,
        type: type || null,
        remainingPercent:
          type && Number.isFinite(remain) && remain >= 0
            ? Math.min(100, Math.round(remain))
            : null,
      });
    }
    out.slots = slots;
  }
  // the job's progress (fork): name, %, minutes left, layer
  if (typeof print.subtask_name === "string")
    out.jobName = print.subtask_name.trim() || null;
  const num = (v: unknown) =>
    typeof v === "number" || (typeof v === "string" && v.trim() !== "")
      ? Number(v)
      : NaN;
  if (print.mc_percent !== undefined && Number.isFinite(num(print.mc_percent)))
    out.percent = Math.max(0, Math.min(100, Math.round(num(print.mc_percent))));
  if (
    print.mc_remaining_time !== undefined &&
    Number.isFinite(num(print.mc_remaining_time))
  )
    out.minutesLeft = Math.max(0, Math.round(num(print.mc_remaining_time)));
  if (print.layer_num !== undefined && Number.isFinite(num(print.layer_num)))
    out.layer = num(print.layer_num);
  if (
    print.total_layer_num !== undefined &&
    Number.isFinite(num(print.total_layer_num))
  )
    out.layers = num(print.total_layer_num);
  if (Array.isArray(print.hms)) {
    out.hms = (print.hms as { attr?: number; code?: number }[])
      .filter((h) => typeof h.attr === "number" && typeof h.code === "number")
      .map((h) => {
        const s = `${hex4(h.attr!)}${hex4(h.code!)}`;
        return `${s.slice(0, 4)}_${s.slice(4, 8)}_${s.slice(8, 12)}_${s.slice(
          12
        )}`;
      });
  }
  return out;
}

/** Why the connection to the printer failed, in the status bar's terms. */
export function connectionProblem(
  message: string | null | undefined
): "auth" | "connection" | null {
  if (!message) return null;
  if (
    /not authori[sz]ed|bad user ?name or password|connack.*(4|5)\b/i.test(
      message
    )
  )
    return "auth";
  if (
    /ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|connack timeout|timed? ?out|offline|closed/i.test(
      message
    )
  )
    return "connection";
  return null;
}
