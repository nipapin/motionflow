"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#6366f1", "#22c55e", "#eab308", "#a855f7", "#f97316"];

export function AdminDonutChart({
  labels,
  data,
  emptyLabel,
}: {
  labels: string[];
  data: number[];
  emptyLabel?: string;
}) {
  const chartData = labels.map((name, i) => ({
    name,
    value: Math.max(0, data[i] ?? 0),
    fill: COLORS[i % COLORS.length],
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
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2}>
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={entry.fill ?? COLORS[index % COLORS.length]} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number | string) => [`$${Number(value).toFixed(2)}`, "Amount"]}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
