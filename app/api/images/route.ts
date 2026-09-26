import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { scanImages } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cfg = loadConfig();
    const images = await scanImages(cfg);
    return NextResponse.json({ images });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
