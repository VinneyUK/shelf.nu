import { describe, expect, it } from "vitest";
import {
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
