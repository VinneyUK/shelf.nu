/**
 * The assets Advanced view's column picker. Its look and behaviour live in the
 * shared ColumnsPicker (fork), so other lists' pickers are the same; this saves
 * the choice to the asset index settings, exactly as before.
 */
import { useMemo } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { ColumnsPicker } from "~/components/list/columns-picker";
import { useDisabled } from "~/hooks/use-disabled";
import {
  parseColumnName,
  type Column,
} from "~/modules/asset-index-settings/helpers";
import type { AssetIndexLoaderData } from "~/routes/_layout+/assets._index";

export function ConfigureColumnsDropdown() {
  const fetcher = useFetcher({
    key: "asset-index-settings-columns",
  });
  const { settings } = useLoaderData<AssetIndexLoaderData>();
  // kept stable between renders: the picker resets to these when they change
  const columns = useMemo(
    () =>
      [...((settings?.columns as Column[]) ?? [])].sort(
        (a, b) => a.position - b.position
      ),
    [settings?.columns]
  );
  const pickerColumns = useMemo(
    () =>
      columns.map((column) => ({
        name: column.name,
        label: parseColumnName(column.name),
        visible: column.visible,
        suffix: column.name.startsWith("cf_") ? "(cf)" : undefined,
      })),
    [columns]
  );
  const disabled = useDisabled(fetcher);

  return (
    <ColumnsPicker
      fixedLabel="Name"
      disabled={disabled}
      columns={pickerColumns}
      onApply={(picked) => {
        const form = new FormData();
        form.set("intent", "changeColumns");
        picked.forEach((p, index) => {
          const column = columns.find((c) => c.name === p.name);
          form.set(`columns[${index}][name]`, p.name);
          form.set(`columns[${index}][position]`, String(index));
          // as a ticked checkbox would submit it; unticked sends nothing
          if (p.visible) form.set(`columns[${index}][visible]`, "on");
          // only custom fields carry a type
          if (p.name.startsWith("cf_") && column?.cfType)
            form.set(`columns[${index}][cfType]`, column.cfType);
        });
        void fetcher.submit(form, {
          method: "post",
          action: "/api/asset-index-settings",
        });
      }}
    />
  );
}
