/**
 * The Matter label (fork, design C): a black band with the Matter mark, the
 * device's QR, then the code and the name, fitted to the label size set.
 */
import { describe, expect, it } from "vitest";
import { MATTER_LOGOS } from "~/modules/matter/logo";
import { textWidth } from "./font-metrics";
import { matterLabelPayload, printRequestBody } from "./layout";

type El = {
  type: string;
  value?: string;
  x?: number;
  size?: number;
  data?: string;
};
const words = (p: El[]) => p.filter((e) => e.type === "text");

describe("matterLabelPayload", () => {
  it("is the QR at the left, the Matter logo beside it near the top, then the code and the name under it", () => {
    const p = matterLabelPayload(
      {
        matterCode: "3497-011-2332",
        name: "Eve Energy",
        payload: "MT:Y.K9042C00KA0648G00",
      },
      { labelWidth: 320, leftMargin: 0 }
    ) as (El & { x_start?: number; y_start?: number })[];
    const qr = p.find((e) => e.type === "qrcode") as El & { x: number };
    expect(qr).toMatchObject({ data: "MT:Y.K9042C00KA0648G00", x: 2 });
    // no black band: the logo is its dots, beside the QR, near the top
    const logo = p.filter((e) => e.type === "rectangle");
    // the largest logo that fits beside the QR
    expect(logo).toHaveLength(MATTER_LOGOS[0].runs.length);
    expect(Math.min(...logo.map((e) => e.x_start ?? 0))).toBeGreaterThan(
      qr.x + 90
    );
    expect(Math.min(...logo.map((e) => e.y_start ?? 0))).toBeLessThan(12);
    const [code, name] = words(p);
    expect([code.value, name.value]).toEqual(["3497-011-2332", "Eve Energy"]);
    // one under the other, lined up under the logo
    expect(code.x).toBe(name.x);
    expect((code as El & { y: number }).y).toBeLessThan(
      (name as El & { y: number }).y
    );
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

  it("uses a smaller logo on a narrow label, and never runs it off the edge", () => {
    for (const labelWidth of [176, 240, 320]) {
      const p = matterLabelPayload(
        {
          matterCode: "1535-511-0751",
          name: "GRILLPLATS plug",
          payload: "MT:Y.K9042C00KA0648G00",
        },
        { labelWidth, leftMargin: 0 }
      ) as { type: string; x_end?: number }[];
      const right = Math.max(
        ...p.filter((e) => e.type === "rectangle").map((e) => e.x_end ?? 0)
      );
      if (labelWidth >= 240) expect(right).toBeLessThanOrEqual(labelWidth - 4);
    }
  });

  it("has no QR when only the 11 digits are known, and the words move left", () => {
    const p = matterLabelPayload(
      { matterCode: "3497-011-2332", name: "Plug", payload: null },
      { labelWidth: 240, leftMargin: 0 }
    ) as El[];
    expect(p.some((e) => e.type === "qrcode")).toBe(false);
    expect(words(p)[0].x).toBeLessThan(10);
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
    expect(body.payload.some((e) => e.type === "rectangle")).toBe(true);
  });
});
