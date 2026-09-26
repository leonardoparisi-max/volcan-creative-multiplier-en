import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { scanComponents } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const cfg = loadConfig();
    const rows = await scanComponents(cfg);
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
