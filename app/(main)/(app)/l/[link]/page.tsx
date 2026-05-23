import "server-only";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

type PageProps = { params: Promise<{ link: string }> };

export default async function Page({ params }: PageProps) {
  const { link } = await params;

  const pool = getPool();
  const [rows] = await pool.execute<(RowDataPacket & { redirect: string })[]>(
    "SELECT `redirect` FROM `short_links` WHERE `link` = ? LIMIT 1",
    [link],
  );

  const target = rows[0]?.redirect;
  if (!target) {
    notFound();
  }

  redirect(target);
}
