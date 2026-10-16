import { describe, expect, it } from "vitest";
import { priceSummary } from "./prices";

const v = (
  kind: string,
  price: number | null,
  discountPrice: number | null = null,
  size: string | null = "1 kg"
) => ({
  kind,
  size,
  price,
  discountPrice,
});

describe("a colour's prices", () => {
  it("gives the 1 kg spool and refill prices, and the best of them", () => {
    const s = priceSummary([
      v("Filament with spool", 19.99),
      v("Refill", 16.99),
    ]);
    expect(s).toEqual({
      spool: { now: 19.99, was: null },
      refill: { now: 16.99, was: null },
      best: 16.99,
      onOffer: false,
    });
  });
  it("marks an offer, with the price it was", () => {
    const s = priceSummary([
      v("Filament with spool", 19.99, 14.99),
      v("Refill", 16.99),
    ]);
    expect(s.spool).toEqual({ now: 14.99, was: 19.99 });
    expect(s.best).toBe(14.99);
    expect(s.onOffer).toBe(true);
  });
  it("ignores a 'discount' that isn't lower, or is zero", () => {
    expect(priceSummary([v("Filament with spool", 19.99, 19.99)]).onOffer).toBe(
      false
    );
    expect(priceSummary([v("Filament with spool", 19.99, 0)]).spool).toEqual({
      now: 19.99,
      was: null,
    });
  });
  it("prices the 1 kg size, not a bundle or a sample", () => {
    const s = priceSummary([
      v("Filament with spool", 69.99, null, "4 x 1 kg"),
      v("Filament with spool", 19.99, null, "1 kg"),
      v("Refill", 9.99, null, "0.5 kg"),
    ]);
    expect(s.spool?.now).toBe(19.99);
    expect(s.refill).toBeNull();
  });
  it("is empty when there's nothing to price", () => {
    expect(priceSummary(null)).toEqual({
      spool: null,
      refill: null,
      best: null,
      onOffer: false,
    });
    expect(priceSummary([v("Refill", null)]).best).toBeNull();
  });
});
