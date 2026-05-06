"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function AdminHorizontalBarChart({
  labels,
  data,
  emptyLabel,
}: {
  labels: string[];
  data: number[];
  emptyLabel?: string;
}) {
  const chartData = labels.map((name, i) => ({
    name: name.length > 28 ? `${name.slice(0, 26)}…` : name,
    fullName: name,
    value: Math.max(0, data[i] ?? 0),
  }));
  const sum = chartData.reduce((s, d) => s + d.value, 0);

  if (sum === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        {emptyLabel ?? "No data"}
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={(v) => `$${v}`} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <Tooltip
            formatter={(value: number | string) => [`$${Number(value).toFixed(2)}`, "Amount"]}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as { fullName?: string } | undefined;
              return p?.fullName ?? "";
            }}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
