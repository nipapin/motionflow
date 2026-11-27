import { NextRequest } from "next/server";
import { sendCepSupportContact, supportContactOptions } from "@/lib/cep-support-contact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = supportContactOptions;

export function POST(req: NextRequest) {
  return sendCepSupportContact(req, "gal-screenshots");
}
