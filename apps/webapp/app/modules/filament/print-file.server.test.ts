/**
 * A print's own figures, from its file on the printer (fork).
 */
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

const ftp = vi.hoisted(() => ({
  files: {} as Record<string, Buffer>,
  tried: [] as string[],
}));
vi.mock("basic-ftp", () => ({
  Client: class {
    access = vi.fn();
    close = vi.fn();
    async downloadTo(sink: NodeJS.WritableStream, path: string) {
      ftp.tried.push(path);
      const file = ftp.files[path];
      if (!file) throw new Error("550 not found");
      await new Promise<void>((done) => sink.write(file, () => done()));
    }
  },
}));
const { candidates, fetchSliceInfo, matchSlots, parseSliceInfo, plateOf } =
  await import("./print-file.server");

const SLICE = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="11.20" used_g="33.41" />
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <filament id="1" type="PLA" color="#000000FF" used_m="2" used_g="5.9" />
    <filament id="3" type="PLA" color="#C12E1F" used_m="1" used_g="2.04" />
  </plate>
</config>`;

describe("parseSliceInfo", () => {
  it("reads each filament's grams for the plate printed", () => {
    expect(parseSliceInfo(SLICE, 1)).toEqual([
      { id: 1, type: "PLA", colourHex: "#000000", grams: 33.4 },
    ]);
    expect(
      parseSliceInfo(SLICE, 2).map((f) => [f.id, f.grams, f.colourHex])
    ).toEqual([
      [1, 5.9, "#000000"],
      [3, 2, "#C12E1F"],
    ]);
  });
  it("takes the first plate with filament when the plate isn't known", () => {
    expect(parseSliceInfo(SLICE).map((f) => f.grams)).toEqual([33.4]);
  });
});

describe("the print's file", () => {
  it("knows the plate and where to look", () => {
    expect(plateOf("/data/Metadata/plate_2.gcode")).toBe(2);
    expect(plateOf("benchy.gcode.3mf")).toBeNull();
    expect(candidates("Metadata/plate_1.gcode", "Cable clips")).toEqual([
      "/Cable clips.gcode.3mf",
      "/cache/Cable clips.gcode.3mf",
      "/model/Cable clips.gcode.3mf",
      "/Cable clips.3mf",
      "/cache/Cable clips.3mf",
      "/model/Cable clips.3mf",
    ]);
  });

  it("reads it from the printer's card over FTPS", async () => {
    const zip = new JSZip();
    zip.file("Metadata/slice_info.config", SLICE);
    ftp.files["/cache/Cable clips.gcode.3mf"] = await zip.generateAsync({
      type: "nodebuffer",
    });
    const out = await fetchSliceInfo(
      { host: "192.168.0.119", accessCode: "12345678" },
      "Metadata/plate_1.gcode",
      "Cable clips"
    );
    expect(out).toEqual([
      { id: 1, type: "PLA", colourHex: "#000000", grams: 33.4 },
    ]);
    expect(ftp.tried[0]).toBe("/Cable clips.gcode.3mf");
  });

  it("is null when the printer no longer has it", async () => {
    expect(
      await fetchSliceInfo({ host: "h", accessCode: "a" }, null, "Gone")
    ).toBeNull();
  });
});

describe("matchSlots", () => {
  const slots = [
    { slot: 1, colourHex: "#D62B2B", material: "PLA" },
    { slot: 2, colourHex: "#161616", material: "PLA" },
    { slot: 3, colourHex: "#3BB143", material: "PLA" },
  ];
  it("gives a one-filament print the one slot that fed it", () => {
    const m = matchSlots(
      [{ id: 1, type: "PLA", colourHex: "#FFFFFF", grams: 10 }],
      slots,
      [3]
    );
    expect(m.get(1)).toBe(3);
  });
  it("otherwise matches each filament to the closest colour of the same material", () => {
    const m = matchSlots(
      [
        { id: 1, type: "PLA", colourHex: "#000000", grams: 5 },
        { id: 3, type: "PLA", colourHex: "#C12E1F", grams: 2 },
      ],
      slots,
      [2, 1]
    );
    expect([m.get(1), m.get(3)]).toEqual([2, 1]);
  });
});
