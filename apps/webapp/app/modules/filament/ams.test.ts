import { describe, expect, it } from "vitest";
import { colourNameFor, sameTrays, traysInReport } from "./ams";

/** The shape an X1C sends, as read from a real one. */
const tray = (id: number, over: Record<string, unknown> = {}) => ({
  id: String(id),
  tag_uid: "3DB9FB3500000100",
  tray_type: "PLA",
  tray_sub_brands: "PLA Basic",
  tray_color: "C12E1FFF",
  remain: 93,
  tray_weight: "1000",
  tray_info_idx: "GFA00",
  ...over,
});
const report = (trays: unknown[]) => ({
  print: { ams: { ams: [{ id: "0", tray: trays }] } },
});

describe("reading the AMS report", () => {
  it("gives each loaded slot's tag, line, colour and what's left", () => {
    const trays = traysInReport(
      report([
        tray(0),
        tray(1, {
          tag_uid: "26035FCB00000100",
          tray_color: "000000FF",
          remain: 46,
        }),
        tray(3, {
          tag_uid: "CAB9A4AF00000100",
          tray_sub_brands: "PLA Silk",
          tray_color: "0047BBFF",
          remain: 69,
        }),
      ])
    );
    expect(
      trays.map((t) => [
        t.slot,
        t.type,
        t.colourHex,
        t.remainingPercent,
        t.tagUid,
      ])
    ).toEqual([
      [1, "PLA Basic", "#C12E1F", 93, "3DB9FB3500000100"],
      [2, "PLA Basic", "#000000", 46, "26035FCB00000100"],
      [4, "PLA Silk", "#0047BB", 69, "CAB9A4AF00000100"],
    ]);
    expect(trays[0].colourName).toBe("Red");
    expect(trays[1].colourName).toBe("Black");
  });
  it("skips empty slots, spools without a Bambu tag, and nonsense", () => {
    expect(
      traysInReport(
        report([
          tray(0, { tag_uid: "0000000000000000" }), // third-party
          tray(1, { tag_uid: "", tray_type: "", tray_sub_brands: "" }), // empty slot
          tray(2, { tray_color: "" }),
          tray(7),
        ])
      )
    ).toEqual([]);
    expect(traysInReport({ print: { nozzle_temper: 25 } })).toEqual([]);
    expect(traysInReport("rubbish")).toEqual([]);
  });
  it("names a shade only when Bambu's catalogue has it for that line", () => {
    expect(colourNameFor("PLA Basic", "#c12e1f")).toBe("Red");
    expect(colourNameFor("PLA Basic", "#123456")).toBeNull();
  });
  it("tells a change from a repeat", () => {
    const a = traysInReport(report([tray(0)]));
    expect(sameTrays(a, traysInReport(report([tray(0)])))).toBe(true);
    expect(sameTrays(a, traysInReport(report([tray(0, { remain: 92 })])))).toBe(
      false
    );
  });
});
