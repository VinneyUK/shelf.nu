import { describe, expect, it } from "vitest";
import { textWidth } from "./font-metrics";
import {
  codeBoxWidth,
  filamentLabelParts,
  filamentLabelPayload,
  labelPayload,
  labelTitle,
  printRequestBody,
  titleStyle,
} from "./layout";

const s30 = { labelWidth: 240, leftMargin: 8 };
const s40 = { labelWidth: 320, leftMargin: 0 };

describe("printRequestBody", () => {
  it("matches what shelf-labels.sh sent Home Assistant, field for field", () => {
    // Captured from the script's test run (15×30 mm labels, 1 mm margin)
    const fromScript = {
      width: 240,
      height: 96,
      rotate: 90,
      payload: [
        {
          x: 10,
          y: 1,
          data: "https://assets.longer-domain-name.co.uk:3443/qr/clxegnjcm005b11tn2cszkw6c",
          type: "qrcode",
          width: 93,
          border: 1,
          height: 93,
          boxsize: 3,
          eclevel: "l",
        },
        {
          x: 110,
          y: 4,
          font: "ppb.ttf",
          size: 16,
          type: "text",
          value: "SAM-0004",
        },
        {
          x: 110,
          y: 27,
          font: "ppb.ttf",
          size: 18,
          type: "text",
          value: "Makita Drill",
          spacing: 2,
          max_width: 126,
        },
      ],
      preview: false,
      device_id: "abc123device",
    };
    const body = printRequestBody(
      {
        sequentialId: "SAM-0004",
        title: "Makita Drill",
        qrUrl:
          "https://assets.longer-domain-name.co.uk:3443/qr/clxegnjcm005b11tn2cszkw6c",
      },
      { ...s30, deviceId: "abc123device", rotate: 90, density: null }
    );
    expect(body).toEqual(fromScript);
  });

  it("only sends density when one is set", () => {
    const content = { sequentialId: "S", title: "T", qrUrl: "u" };
    const base = { ...s30, deviceId: "d", rotate: 90 };
    expect(
      printRequestBody(content, { ...base, density: null })
    ).not.toHaveProperty("density");
    expect(printRequestBody(content, { ...base, density: 3 })).toMatchObject({
      density: 3,
    });
  });

  it("can ask Home Assistant for a preview instead of a print", () => {
    const body = printRequestBody(
      { sequentialId: "S", title: "T", qrUrl: "u" },
      { ...s30, deviceId: "d", rotate: 90, density: null },
      { preview: true }
    );
    expect(body.preview).toBe(true);
  });
});

describe("labelTitle", () => {
  it("cuts long names exactly as the script did", () => {
    // The script's results for these, from its test runs
    expect(
      labelTitle(
        "Bosch Professional GBH 2-28 Hammer Drill with SDS-Plus chuck and case",
        s30
      )
    ).toBe("Bosch Professional GBH 2-28…");
    expect(
      labelTitle(
        "Bosch Professional GBH 2-28 Hammer Drill with SDS-Plus chuck and case",
        {
          labelWidth: 240,
          leftMargin: 0,
        }
      )
    ).toBe("Bosch Professional GBH 2-28 H…");
  });

  it("leaves short names alone and tidies whitespace", () => {
    expect(labelTitle("  Makita   Drill \n", s30)).toBe("Makita Drill");
  });
});

describe("titleStyle", () => {
  it("uses bigger text on 40 mm labels and smaller on 30 mm", () => {
    expect(titleStyle(s40)).toEqual({ size: 20, maxChars: 40 });
    expect(titleStyle(s30)).toEqual({ size: 18, maxChars: 28 });
  });

  it("moves everything right by the margin", () => {
    const [qr, sam, title] = labelPayload(
      { sequentialId: "S", title: "T", qrUrl: "u" },
      { labelWidth: 240, leftMargin: 12 }
    );
    expect([qr.x, sam.x, title.x, title.max_width]).toEqual([
      14, 114, 114, 122,
    ]);
  });
});

// ------------------------------------------------------- filament labels

describe("filament labels", () => {
  const content = {
    filamentId: "FIL-0001",
    colour: "Jade White",
    line: "PLA Basic",
    boxCode: "10100",
    qrUrl: "https://shelf.local/qr/abc",
  };
  const at = (labelWidth: number, leftMargin = 8) => ({
    labelWidth,
    leftMargin,
  });
  const texts = (payload: ReturnType<typeof filamentLabelPayload>) =>
    payload.filter((e) => e.type === "text") as {
      value: string;
      x: number;
      size: number;
      color?: string;
    }[];

  it("puts the number on top with the code beside it, then colour and line", () => {
    for (const width of [240, 320, 400]) {
      const p = filamentLabelParts(content, at(width));
      expect(p.narrow).toBe(false);
      expect(p.id.value).toBe("FIL-0001");
      expect(p.code).toEqual({ value: "10100", top: 3, alignRight: true });
      expect(p.colour.lines).toEqual(["Jade White"]);
      expect(p.line?.value).toBe("PLA Basic");
      // top to bottom: number, colour, line
      expect(p.id.baseline).toBeLessThan(p.colour.baselines[0]);
      expect(p.colour.baselines[0]).toBeLessThan(p.line!.baseline);
    }
  });

  it("prints the code white on a black box at the right edge", () => {
    const payload = filamentLabelPayload(content, at(240));
    const box = payload.find((e) => e.type === "rectangle") as {
      x_start: number;
      x_end: number;
      fill: string;
    };
    expect(box.fill).toBe("black");
    expect(box.x_end).toBe(240 - 4);
    expect(box.x_end - box.x_start).toBe(codeBoxWidth("10100"));
    const code = texts(payload).find((t) => t.value === "10100");
    expect(code?.color).toBe("white");
  });

  it("keeps the number clear of the code's box", () => {
    for (const width of [240, 320, 400]) {
      const payload = filamentLabelPayload(content, at(width));
      const id = texts(payload).find((t) => t.value === "FIL-0001")!;
      const box = payload.find((e) => e.type === "rectangle") as {
        x_start: number;
      };
      expect(id.x + textWidth("FIL-0001", id.size)).toBeLessThan(box.x_start);
    }
  });

  it("never lets text run off the label", () => {
    const long = {
      ...content,
      colour: "Dawn Radiance Shimmering Extra",
      line: "PLA Silk Multi-Color",
    };
    for (const width of [176, 240, 320, 400]) {
      const right = width - 4;
      for (const t of texts(filamentLabelPayload(long, at(width)))) {
        if (t.color === "white") continue; // inside its box
        expect(t.x + textWidth(t.value, t.size)).toBeLessThanOrEqual(right);
      }
    }
  });

  it("shrinks a long colour rather than cutting it, while it can", () => {
    const p = filamentLabelParts(
      { ...content, colour: "Dawn Radiance" },
      at(240)
    );
    expect(p.colour.lines).toEqual(["Dawn Radiance"]);
    expect(p.colour.size).toBeLessThan(25);
  });

  it("on 12 × 22 mm moves the code to the bottom row and leaves the line off", () => {
    const p = filamentLabelParts(content, at(176));
    expect(p.narrow).toBe(true);
    expect(p.code).toEqual({ value: "10100", top: 66, alignRight: false });
    expect(p.line).toBeNull();
  });

  it("on 12 × 22 mm wraps a long colour onto two lines", () => {
    const p = filamentLabelParts(
      { ...content, colour: "Dawn Radiance" },
      at(176)
    );
    expect(p.colour.lines).toEqual(["Dawn", "Radiance"]);
    expect(p.colour.baselines).toHaveLength(2);
  });

  it("without a code, shows the line and leaves the code's place empty", () => {
    const wide = filamentLabelPayload({ ...content, boxCode: null }, at(240));
    expect(wide.some((e) => e.type === "rectangle")).toBe(false);
    expect(texts(wide).map((t) => t.value)).toContain("PLA Basic");
    const narrow = filamentLabelParts({ ...content, boxCode: "  " }, at(176));
    expect(narrow.code).toBeNull();
    expect(narrow.line?.value).toBe("PLA Basic");
  });

  it("falls back to the bottom row when a code is too long to sit beside the number", () => {
    const p = filamentLabelParts(
      { ...content, boxCode: "A1234567890" },
      at(240)
    );
    expect(p.narrow).toBe(true);
    expect(p.code?.alignRight).toBe(false);
  });

  it("is what printRequestBody sends for filament", () => {
    const body = printRequestBody(content, {
      ...at(240),
      deviceId: "abc",
      rotate: 90,
      density: null,
    });
    expect(body.payload).toEqual(filamentLabelPayload(content, at(240)));
    expect(body.payload[0]).toMatchObject({
      type: "qrcode",
      data: content.qrUrl,
    });
  });
});
