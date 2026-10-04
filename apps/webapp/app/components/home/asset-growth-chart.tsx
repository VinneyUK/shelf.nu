import { useLoaderData } from "react-router";
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"; // fork: two axes (assets and inventory value)
import { ClientOnly } from "remix-utils/client-only";
import type { loader } from "~/routes/_layout+/home";
import { DashboardEmptyState } from "../dashboard/empty-state";
import FallbackLoading from "../dashboard/fallback-loading";
import { Button } from "../shared/button";

export default function AssetGrowthChart() {
  const { assetGrowthData, totalAssets, currency } =
    useLoaderData<typeof loader>();

  // Build short month labels: "Mar '25"
  const chartData = assetGrowthData.map(
    (d: {
      month: string;
      year: number;
      "Total assets": number;
      "Inventory value": number;
    }) => ({
      date: `${d.month.slice(0, 3)} '${String(d.year).slice(2)}`,
      "Total assets": d["Total assets"],
      "Inventory value": d["Inventory value"],
    })
  );
  // the workspace's currency, compact on the axis and in full in the tooltip
  const fmt = (fractionDigits: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency ?? "GBP",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  const money = (v: number) =>
    v >= 1000 ? `${fmt(0).format(v / 1000)}k` : fmt(0).format(v);

  return (
    <div className="flex h-full flex-col rounded border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-gray-900">
            Asset growth
          </span>
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600">
            12 months
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            to="/assets"
            variant="block-link-gray"
            className="!mt-0 text-xs"
          >
            View all
          </Button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        {totalAssets > 0 ? (
          <ClientOnly
            fallback={<FallbackLoading className="h-[180px] w-full" />}
          >
            {() => (
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#ef6820"
                        stopOpacity={0.25}
                      />
                      <stop offset="100%" stopColor="#ef6820" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="assets"
                    width={32}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="value"
                    orientation="right"
                    width={44}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={money}
                  />
                  <Tooltip
                    formatter={(v, name) =>
                      name === "Inventory value"
                        ? [fmt(2).format(Number(v)), String(name)]
                        : [String(v), String(name)]
                    }
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  />
                  <Area
                    yAxisId="assets"
                    type="monotone"
                    dataKey="Total assets"
                    stroke="#ef6820"
                    strokeWidth={2}
                    fill="url(#growthFill)"
                    isAnimationActive
                  />
                  <Line
                    yAxisId="value"
                    type="monotone"
                    dataKey="Inventory value"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ClientOnly>
        ) : (
          <DashboardEmptyState
            text="No assets yet"
            subText="Create assets to see your growth trend here."
            ctaTo="/assets/new"
            ctaText="Create an asset"
          />
        )}
      </div>
    </div>
  );
}
