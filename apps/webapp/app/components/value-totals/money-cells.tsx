/**
 * The money cells of the Categories, Places and Boxes lists (fork), and the
 * totals row. The workspace's own currency; a gain in green, a loss in red.
 * Part of the fork; not in upstream Shelf.
 */
import type { ReactNode } from "react";
import { Td, Tr } from "~/components/table";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import { differenceTone } from "~/modules/value-totals/figures";
import { formatCurrency } from "~/utils/currency";
import { tw } from "~/utils/tw";

/** Formats an amount in the workspace's currency. */
export function useMoney() {
  const organization = useCurrentOrganization();
  const currency = organization?.currency ?? "GBP";
  return (value: number) =>
    formatCurrency({ value, currency, locale: "en-GB" });
}

const DASH = "—";

/** An amount, or a dash when there's nothing to show. */
export function MoneyTd({
  value,
  dashWhenZero = false,
}: {
  value: number;
  dashWhenZero?: boolean;
}) {
  const money = useMoney();
  return (
    <Td className="whitespace-nowrap">
      {dashWhenZero && value === 0 ? DASH : money(value)}
    </Td>
  );
}

/** Sell price minus recorded value: green for a gain, red for a loss. A dash if nothing was sold. */
export function DifferenceTd({
  difference,
  soldFor,
}: {
  difference: number;
  soldFor: number;
}) {
  const money = useMoney();
  if (difference === 0 && soldFor === 0) return <Td>{DASH}</Td>;
  const tone = differenceTone(difference);
  return (
    <Td
      className={tw(
        "whitespace-nowrap",
        tone === "gain" && "text-success-600",
        tone === "loss" && "text-error-600"
      )}
    >
      {tone === "gain" ? "+" : ""}
      {money(difference)}
    </Td>
  );
}

/** The bottom row of a list: a label, then the totals under their columns. */
export function TotalsRow({
  leading = 0,
  children,
}: {
  leading?: number;
  children: ReactNode;
}) {
  return (
    <Tr className="bg-gray-50 font-semibold hover:bg-gray-50">
      {/* the bulk-select checkbox column, if the list has one */}
      {Array.from({ length: leading }, (_, i) => (
        <Td key={i}>{null}</Td>
      ))}
      {children}
    </Tr>
  );
}
