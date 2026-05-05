import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EarningsLegend() {
  return (
    <Card className="border-border/60 bg-muted/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Designations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          <strong className="text-destructive">Transaction tax</strong> — payment processor / bank fees and VAT
          deducted from gross sale price.
        </p>
        <p>
          <strong className="text-foreground">Shared / Team</strong> — team projects split profit between co-authors;
          your line shows your share and counterpart.
        </p>
        <p>
          <strong className="text-foreground">Affiliate</strong> — earnings attributed to a referral link.{" "}
          <strong>Co-Affiliate</strong>, <strong>Coupon</strong>, <strong>Upgrade</strong> — additional modifiers on
          the sale row per marketplace rules.
        </p>
      </CardContent>
    </Card>
  );
}
