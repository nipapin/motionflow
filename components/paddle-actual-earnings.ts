import { createElement as h } from "react";
import { getActualEarningsEntries } from "@/lib/paddle-actual";

export async function ActualPaddleEarnings({ userId }: { userId: number }) {
  const rows = await getActualEarningsEntries(userId);
  if (!rows.length) return null;
  return h("section", { className: "rounded-xl border p-4 space-y-3", "aria-label": "Paddle accruals" },
    h("h2", { className: "font-semibold" }, "Paddle accruals"),
    h("p", { className: "text-sm text-muted-foreground" }, "Latest saved accruals and refund adjustments. Pending payments are excluded from your available balance."),
    h("div", { className: "overflow-x-auto" }, h("table", { className: "w-full text-sm" },
      h("thead", null, h("tr", null, ...["When (UTC)", "Payment", "Entry", "Status", "Your amount"].map(s => h("th", { key: s, className: "p-2 text-left" }, s)))),
      h("tbody", null, ...rows.map(r => h("tr", { key: r.id, className: "border-t" },
        h("td", { className: "p-2 whitespace-nowrap" }, r.createdAt),
        h("td", { className: "p-2 font-mono text-xs" }, r.transactionId),
        h("td", { className: "p-2" }, r.adjustmentId ? "Adjustment" : "Payment"),
        h("td", { className: "p-2" }, r.status === "pending" ? "Pending" : "Posted"),
        h("td", { className: "p-2 tabular-nums" }, r.amount == null ? "Pending" : `${r.amount} ${r.currency}`),
      ))),
    )),
  );
}
