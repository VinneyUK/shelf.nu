import { describe, expect, it } from "vitest";
import { differenceTone, NO_FIGURES, roundMoney, sumFigures } from "./figures";
import {
  BOX_FIGURES_SQL,
  CATEGORY_FIGURES_SQL,
  PLACE_FIGURES_SQL,
  UNCATEGORISED_FIGURES_SQL,
} from "./sql";

describe("sumFigures", () => {
  it("adds every column, for the totals row", () => {
    expect(
      sumFigures([
        { assets: 2, recorded: 150, soldFor: 80, difference: -20 },
        { assets: 2, recorded: 100, soldFor: 180, difference: 50 },
      ])
    ).toEqual({ assets: 4, recorded: 250, soldFor: 260, difference: 30 });
  });
  it("is nothing for no rows", () => {
    expect(sumFigures([])).toEqual(NO_FIGURES);
  });
  it("doesn't show floating point dust", () => {
    const t = sumFigures(
      [0.1, 0.2].map((n) => ({
        assets: 1,
        recorded: n,
        soldFor: n,
        difference: n,
      }))
    );
    expect(t.recorded).toBe(0.3);
    expect(t.soldFor).toBe(0.3);
    expect(roundMoney(1.005 * 100)).toBe(100.5);
  });
});

describe("differenceTone", () => {
  it("tells a gain from a loss from nothing", () => {
    expect(differenceTone(10)).toBe("gain");
    expect(differenceTone(-0.01)).toBe("loss");
    expect(differenceTone(0)).toBe("none");
  });
});

describe("the totals queries (their results were checked against a real Postgres)", () => {
  const all = {
    CATEGORY_FIGURES_SQL,
    UNCATEGORISED_FIGURES_SQL,
    PLACE_FIGURES_SQL,
    BOX_FIGURES_SQL,
  };

  it("only ever look at one workspace's assets, and take it as a parameter", () => {
    for (const [name, sql] of Object.entries(all)) {
      expect(sql, name).toMatch(/"organizationId" = \$1/);
      expect(sql, name).not.toMatch(/\$\{/); // nothing is pasted into the SQL
    }
  });
  it("read the value column, not the Prisma field name", () => {
    for (const sql of Object.values(all)) {
      expect(sql).toMatch(/"value"/);
      expect(sql).not.toMatch(/"valuation"/);
    }
  });
  it("count value times quantity, and compare a sale price like for like", () => {
    expect(CATEGORY_FIGURES_SQL).toMatch(/COALESCE\(a\."quantity", 1\)/);
    expect(PLACE_FIGURES_SQL).toMatch(/al\."quantity"/);
    expect(BOX_FIGURES_SQL).toMatch(/ak\."quantity"/);
    for (const sql of Object.values(all)) {
      expect(sql).toMatch(/s\."price" IS NOT NULL AND a\."value" IS NOT NULL/);
    }
  });
  it("take the boxes asked for as a list", () => {
    expect(BOX_FIGURES_SQL).toMatch(/ANY\(\$2::text\[\]\)/);
  });
});
