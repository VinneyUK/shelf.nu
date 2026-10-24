/**
 * The Matter label (fork, design C): a black band with M, the device's QR,
 * then MATTER, the code and the name.
 */
import { describe, expect, it } from "vitest";
import { MATTER_BAND, matterLabelPayload, printRequestBody } from "./layout";

const settings = { labelWidth: 320, leftMargin: 0 };

describe("matterLabelPayload", () => {
  it("is the band, the QR of the device's code, and the code and name beside it", () => {
    const p = matterLabelPayload(
      {
        matterCode: "3497-011-2332",
        name: "Eve Energy",
        payload: "MT:Y.K9042C00KA0648G00",
      },
      settings
    );
    expect(p[0]).toMatchObject({
      type: "rectangle",
      x_start: 0,
      x_end: MATTER_BAND,
      fill: "black",
    });
    expect(p[1]).toMatchObject({ type: "text", value: "M", color: "white" });
    expect(p[2]).toMatchObject({
      type: "qrcode",
      data: "MT:Y.K9042C00KA0648G00",
    });
    const words = p
      .filter((e) => e.type === "text")
      .map((e) => (e as { value: string }).value);
    expect(words).toEqual(["M", "MATTER", "3497-011-2332", "Eve Energy"]);
  });

  it("has no QR when only the 11 digits are known, and the words move left", () => {
    const p = matterLabelPayload(
      { matterCode: "3497-011-2332", name: "Plug", payload: null },
      settings
    );
    expect(p.some((e) => e.type === "qrcode")).toBe(false);
    const code = p.find(
      (e) => (e as { value?: string }).value === "3497-011-2332"
    ) as { x: number };
    expect(code.x).toBeLessThan(MATTER_BAND + 20);
  });

  it("cuts a long name to fit", () => {
    const p = matterLabelPayload(
      {
        matterCode: "3497-011-2332",
        name: "A very long device name that won't fit at all",
        payload: "MT:Y.K9042C00KA0648G00",
      },
      { labelWidth: 240, leftMargin: 0 }
    );
    expect((p[p.length - 1] as { value: string }).value).toMatch(/…$/);
  });

  it("is what's sent to the printer for a Matter label", () => {
    const body = printRequestBody(
      { matterCode: "3497-011-2332", name: "Eve Energy", payload: null },
      { ...settings, deviceId: "d", rotate: 0, density: null }
    );
    expect(body.payload[0]).toMatchObject({ type: "rectangle", fill: "black" });
  });
});
