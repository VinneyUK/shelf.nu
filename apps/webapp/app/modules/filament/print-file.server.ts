/**
 * A print's own figures (fork): the slicer's grams for each filament, read
 * from the print's file on the printer. Bambu Studio writes them into the
 * file (Metadata/slice_info.config in the .3mf); the printer keeps the file
 * on its card, which Shelf reads over the printer's FTPS with the same
 * access code it already uses, on the local network.
 */
import { Writable } from "node:stream";
import { Client } from "basic-ftp";
import JSZip from "jszip";

export type SlicedFilament = {
  /** The project's filament number, 1 up */
  id: number;
  /** e.g. "PLA" */
  type: string | null;
  /** "#RRGGBB" */
  colourHex: string | null;
  /** The slicer's grams for the whole print */
  grams: number;
};

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/**
 * The slicer's grams for each filament, from slice_info.config: the plate
 * given (from "Metadata/plate_2.gcode"), else the first with filament.
 */
export function parseSliceInfo(
  xml: string,
  plate?: number | null
): SlicedFilament[] {
  const plates = xml.split(/<plate\b/).slice(1);
  const read = (p: string) =>
    [...p.matchAll(/<filament\b[^>]*\/?>/g)]
      .map((m) => m[0])
      .map((tag) => ({
        id: Number(attr(tag, "id")),
        type: attr(tag, "type"),
        colourHex: (attr(tag, "color") ?? "").slice(0, 7).toUpperCase() || null,
        grams: Math.round(Number(attr(tag, "used_g")) * 10) / 10,
      }))
      .filter(
        (f) => Number.isFinite(f.id) && Number.isFinite(f.grams) && f.grams > 0
      );
  if (plate) {
    const chosen = plates.find((p) =>
      new RegExp(`key="index"\\s+value="${plate}"`).test(p)
    );
    if (chosen) return read(chosen);
  }
  for (const p of plates) {
    const f = read(p);
    if (f.length) return f;
  }
  return [];
}

/** The plate number in "Metadata/plate_2.gcode", if it's there. */
export function plateOf(gcodeFile: string | null | undefined) {
  const m = /plate_(\d+)\.gcode/i.exec(gcodeFile ?? "");
  return m ? Number(m[1]) : null;
}

/** The file names to look for on the printer's card, most likely first. */
export function candidates(gcodeFile: string | null, jobName: string) {
  const names = new Set<string>();
  const base = (gcodeFile ?? "").split("/").pop() ?? "";
  if (base.endsWith(".3mf")) names.add(base);
  for (const n of [jobName, base.replace(/\.gcode$/i, "")])
    if (n && !/^plate_\d+$/i.test(n)) {
      names.add(`${n}.gcode.3mf`);
      names.add(`${n}.3mf`);
    }
  const out: string[] = [];
  for (const n of names)
    for (const dir of ["/", "/cache/", "/model/"]) out.push(`${dir}${n}`);
  return out;
}

/** Reads the print's file from the printer and returns the slicer's figures, or null. */
export async function fetchSliceInfo(
  printer: { host: string; accessCode: string },
  gcodeFile: string | null,
  jobName: string
): Promise<SlicedFilament[] | null> {
  const client = new Client(20_000);
  try {
    await client.access({
      host: printer.host,
      port: 990,
      user: "bblp",
      password: printer.accessCode,
      secure: "implicit",
      // the printer's own certificate isn't one a computer would trust
      secureOptions: { rejectUnauthorized: false },
    });
    for (const path of candidates(gcodeFile, jobName)) {
      const chunks: Buffer[] = [];
      const sink = new Writable({
        write(chunk, _enc, done) {
          chunks.push(Buffer.from(chunk));
          done();
        },
      });
      try {
        await client.downloadTo(sink, path);
      } catch {
        continue; // not there: the next place
      }
      const zip = await JSZip.loadAsync(Buffer.concat(chunks));
      const xml = await zip.file("Metadata/slice_info.config")?.async("string");
      if (xml) return parseSliceInfo(xml, plateOf(gcodeFile));
    }
    return null;
  } finally {
    client.close();
  }
}

/** How alike two colours are: 0 the same, larger further apart. */
export function colourDistance(a: string | null, b: string | null) {
  const rgb = (h: string | null) => {
    const m = /^#?([0-9a-f]{6})/i.exec(h ?? "");
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return 1000;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/**
 * Which AMS slot each of the print's filaments came from: the one slot that
 * fed a one-filament print; otherwise the slot whose spool is the closest
 * colour of the same material, preferring slots seen feeding it.
 */
export function matchSlots(
  filaments: SlicedFilament[],
  slots: { slot: number; colourHex: string | null; material: string | null }[],
  fed: number[]
): Map<number, number> {
  const out = new Map<number, number>();
  if (filaments.length === 1 && fed.length === 1) {
    out.set(filaments[0].id, fed[0]);
    return out;
  }
  const taken = new Set<number>();
  for (const f of filaments) {
    const ranked = slots
      .filter((s) => !taken.has(s.slot))
      .map((s) => ({
        s,
        score:
          colourDistance(f.colourHex, s.colourHex) +
          (f.type &&
          s.material &&
          f.type.toUpperCase() !== s.material.toUpperCase()
            ? 500
            : 0) -
          (fed.includes(s.slot) ? 40 : 0),
      }))
      .sort((a, b) => a.score - b.score);
    const best = ranked[0];
    if (best && best.score < 300) {
      out.set(f.id, best.s.slot);
      taken.add(best.s.slot);
    }
  }
  return out;
}
