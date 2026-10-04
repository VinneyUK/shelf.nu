/** Form fields for the edit form's Sold row. Part of the sold feature; not in upstream Shelf. */
export const SOLD_FIELDS = {
  sold: "forkSold",
  soldOn: "forkSoldOn",
  price: "forkSoldPrice",
} as const;

/** The "SOLD" value the status filters accept alongside Shelf's statuses. */
export const SOLD_STATUS = "SOLD";
