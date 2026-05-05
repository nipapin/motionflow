"use client";

import * as React from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategoryCount } from "@/lib/author/dashboard-stats";

/** Theme tokens are already full colors (`hsl(...)`), not bare hue/sat/light tuples — use `var()` only. */
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

interface CategoryDonutProps {
  data: CategoryCount[];
}

export function CategoryDonut({ data }: CategoryDonutProps) {
  const chartData = React.useMemo(
    () => data.map((d) => ({ name: d.label, value: d.count })),
    [data],
  );

  if (chartData.length === 0 || chartData.every((d) => d.value === 0)) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No published items yet
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={88} paddingAngle={2}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--card)",
              color: "var(--foreground)",
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
