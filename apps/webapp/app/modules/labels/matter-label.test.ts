/**
 * The Matter label (fork, design C): a black band with the Matter mark, the
 * device's QR, then the code and the name, fitted to the label size set.
 */
import { describe, expect, it } from "vitest";
import { textWidth } from "./font-metrics";
import { MATTER_BAND, matterLabelPayload, printRequestBody } from "./layout";

type El = {
  type: string;
  value?: string;
  x?: number;
  size?: number;
  data?: string;
};
const words = (p: El[]) => p.filter((e) => e.type === "text");

describe("matterLabelPayload", () => {
  it("is the band with the Matter mark, the QR, then the code and the name", () => {
    const p = matterLabelPayload(
      {
        matterCode: "3497-011-2332",
        name: "Eve Energy",
        payload: "MT:Y.K9042C00KA0648G00",
      },
      { labelWidth: 320, leftMargin: 0 }
    ) as El[];
    expect(p[0]).toMatchObject({
      type: "rectangle",
      x_start: 0,
      x_end: MATTER_BAND,
      fill: "black",
    });
    // the mark: three white lines and three dots, no letters
    expect(p.filter((e) => e.type === "line")).toHaveLength(3);
    expect(p.filter((e) => e.type === "circle")).toHaveLength(3);
    expect(p.find((e) => e.type === "qrcode")?.data).toBe(
      "MT:Y.K9042C00KA0648G00"
    );
    expect(words(p).map((e) => e.value)).toEqual([
      "3497-011-2332",
      "Eve Energy",
    ]);
  });

  it("fits the code and name inside the label set, however narrow", () => {
    for (const labelWidth of [176, 240, 280, 320]) {
      const p = matterLabelPayload(
        {
          matterCode: "1535-511-0754",
          name: "GRILLPLATS (Kitchen)",
          payload: "MT:Y.K9042C00KA0648G00",
        },
        { labelWidth, leftMargin: 0 }
      ) as El[];
      for (const w of words(p))
        expect(
          (w.x ?? 0) + textWidth(w.value ?? "", w.size ?? 0)
        ).toBeLessThanOrEqual(labelWidth - 4);
    }
  });

  it("keeps the whole code at a normal label width, shrinking it rather than cutting it", () => {
    const p = matterLabelPayload(
      {
        matterCode: "1535-511-0754",
        name: "GRILLPLATS",
        payload: "MT:Y.K9042C00KA0648G00",
      },
      { labelWidth: 240, leftMargin: 0 }
    ) as El[];
    expect(words(p)[0].value).toBe("1535-511-0754");
  });

  it("has no QR when only the 11 digits are known, and the words move left", () => {
    const p = matterLabelPayload(
      { matterCode: "3497-011-2332", name: "Plug", payload: null },
      { labelWidth: 240, leftMargin: 0 }
    ) as El[];
    expect(p.some((e) => e.type === "qrcode")).toBe(false);
    expect(words(p)[0].x).toBeLessThan(MATTER_BAND + 20);
  });

  it("is what's sent to the printer for a Matter label", () => {
    const body = printRequestBody(
      { matterCode: "3497-011-2332", name: "Eve Energy", payload: null },
      {
        labelWidth: 240,
        leftMargin: 0,
        deviceId: "d",
        rotate: 0,
        density: null,
      }
    );
    expect(body.width).toBe(240);
    expect(body.payload[0]).toMatchObject({ type: "rectangle", fill: "black" });
  });
});
