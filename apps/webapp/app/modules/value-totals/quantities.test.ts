/**
 * Quantities (fork): every asset's quantity counts in the totals.
 */
import { describe, expect, it } from "vitest";
import { columnsWithoutSwitchedOff } from "~/modules/customisation/catalogue";
import { DEFAULT_CUSTOMISATIONS } from "~/modules/customisation/catalogue";
import {
  BOX_FIGURES_SQL,
  CATEGORY_FIGURES_SQL,
  PLACE_FIGURES_SQL,
} from "./sql";

describe("totals use each asset's quantity", () => {
  it("counts an individually tracked asset's own quantity in places and boxes", () => {
    for (const sql of [PLACE_FIGURES_SQL, BOX_FIGURES_SQL]) {
      expect(sql).toContain(`CASE WHEN a."type" = 'QUANTITY_TRACKED' THEN`);
      expect(sql).toContain(`ELSE COALESCE(a."quantity", 1) END`);
    }
  });

  it("counts value × quantity by category, none recorded being 1", () => {
    expect(CATEGORY_FIGURES_SQL).toContain(
      `COALESCE(a."value", 0) * COALESCE(a."quantity", 1)`
    );
  });
});

describe("no tracking methods", () => {
  it("leaves the Tracking method and Min quantity columns out", () => {
    const cols = [
      { name: "title" },
      { name: "type" },
      { name: "quantity" },
      { name: "minQuantity" },
    ];
    expect(
      columnsWithoutSwitchedOff(cols, DEFAULT_CUSTOMISATIONS).map((c) => c.name)
    ).toEqual(["title", "quantity"]);
  });
});
