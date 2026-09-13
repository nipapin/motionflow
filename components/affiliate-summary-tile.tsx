import { Card, CardContent } from "@/components/ui/card";

interface AffiliateSummaryTileProps {
  title: string;
  value: string;
  hint?: string;
}

/** Compact stat tile used on both the admin and partner overview pages. */
export function AffiliateSummaryTile({ title, value, hint }: AffiliateSummaryTileProps) {
  return (
    <Card className="border-blue-500/20 bg-card/40">
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
