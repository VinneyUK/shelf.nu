/**
 * Inventory value on the growth chart (fork): a running total that rises when
 * assets are added and falls when they're sold.
 */
import { describe, expect, it } from "vitest";
import { buildMonthlyGrowthData } from "./dashboard.server";

const monthStart = (monthsAgo: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - monthsAgo, 1);
};

describe("buildMonthlyGrowthData with inventory value", () => {
  it("carries the baseline, adds value when assets arrive, and drops it when sold", () => {
    const rows = buildMonthlyGrowthData(
      [
        { month_start: monthStart(2), assets_created: 2, value_added: 1500 },
        { month_start: monthStart(0), assets_created: 1, value_added: 300 },
      ],
      5,
      {
        baseline: 1000,
        added: [
          { month_start: monthStart(2), assets_created: 2, value_added: 1500 },
          { month_start: monthStart(0), assets_created: 1, value_added: 300 },
        ],
        sold: [{ month_start: monthStart(1), value_sold: 400 }],
      }
    );
    expect(rows).toHaveLength(12);
    const idx2 = 9; // months are index 0 (11 ago) … 11 (this month); 2 ago = 9
    expect(rows[idx2]["Inventory value"]).toBe(2500);
    expect(rows[10]["Inventory value"]).toBe(2100); // sold 400 last month
    expect(rows[11]["Inventory value"]).toBe(2400); // +300 this month
    expect(rows[11]["Total assets"]).toBe(8);
  });

  it("never goes below zero and works without any value data", () => {
    const rows = buildMonthlyGrowthData([], 0);
    expect(rows.every((r) => r["Inventory value"] === 0)).toBe(true);
    const dipped = buildMonthlyGrowthData([], 0, {
      baseline: 100,
      added: [],
      sold: [{ month_start: monthStart(0), value_sold: 500 }],
    });
    expect(dipped[11]["Inventory value"]).toBe(0);
  });
});
