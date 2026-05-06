import type { ReactNode } from "react";
import { Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AdminComingSoon({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <Card className="border-border/60 max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Construction className="size-5 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children ? <CardContent className="text-sm text-muted-foreground">{children}</CardContent> : null}
    </Card>
  );
}
