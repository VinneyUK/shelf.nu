/**
 * The money columns of the Categories, Places and Boxes lists (fork). Pure, so
 * it is used by both the server and the pages. See sql.ts for the definitions.
 */
export type Figures = {
  /** How many assets are counted */
  assets: number;
  /** The value recorded on them */
  recorded: number;
  /** What the sold ones were sold for */
  soldFor: number;
  /** soldFor minus the recorded value, over sold assets with both a price and a value */
  difference: number;
};

export const NO_FIGURES: Figures = {
  assets: 0,
  recorded: 0,
  soldFor: 0,
  difference: 0,
};

/** To pence, so sums of floats don't show 0.30000000000000004. */
export const roundMoney = (n: number) => Math.round(n * 100) / 100;

/** The totals row: every column summed. */
export function sumFigures(list: Figures[]): Figures {
  const total = list.reduce(
    (t, f) => ({
      assets: t.assets + f.assets,
      recorded: t.recorded + f.recorded,
      soldFor: t.soldFor + f.soldFor,
      difference: t.difference + f.difference,
    }),
    NO_FIGURES
  );
  return {
    assets: total.assets,
    recorded: roundMoney(total.recorded),
    soldFor: roundMoney(total.soldFor),
    difference: roundMoney(total.difference),
  };
}

/** A gain is good, a loss is not, and nothing is neither. */
export function differenceTone(difference: number): "gain" | "loss" | "none" {
  if (difference > 0) return "gain";
  if (difference < 0) return "loss";
  return "none";
}
