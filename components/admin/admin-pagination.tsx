import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AdminPagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
      {page > 1 ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={hrefFor(page - 1)}>Previous</Link>
        </Button>
      ) : null}
      <span className="px-2 text-sm tabular-nums text-muted-foreground">
        Page {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={hrefFor(page + 1)}>Next</Link>
        </Button>
      ) : null}
    </div>
  );
}
