import { NextRequest, NextResponse } from "next/server";
import {
  fetchPexelsVideos,
  type FootageVideo,
  type FootageVideoSearchResult,
} from "@/lib/pexels-videos";
import { guardStockRequest } from "@/lib/cep-stock-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type { FootageVideo, FootageVideoSearchResult };

export async function GET(req: NextRequest) {
  const gate = await guardStockRequest(req);
  if ("response" in gate) return gate.response;

  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("query") ?? "").trim();
    const orientationParam = (searchParams.get("orientation") ?? "").trim();
    const orientation =
      orientationParam === "landscape" ||
      orientationParam === "portrait" ||
      orientationParam === "square"
        ? orientationParam
        : undefined;

    const pageRaw = Number(searchParams.get("page") ?? "1");
    const perPageRaw = Number(searchParams.get("perPage") ?? "24");
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : 24;

    const result = await fetchPexelsVideos({
      query: query || undefined,
      page,
      perPage,
      orientation,
    });

    return NextResponse.json(result satisfies FootageVideoSearchResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pexels request failed.";
    if (message.includes("not configured")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    console.error("[pexels-videos] request failed", err);
    return NextResponse.json({ error: "Pexels request failed." }, { status: 500 });
  }
}
