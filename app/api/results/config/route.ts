import { NextRequest, NextResponse } from "next/server";
import { loadResultsConfig, saveResultsConfig } from "@/lib/results/store";
import type { ResultsConfig } from "@/lib/results/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(loadResultsConfig());
}

export async function PUT(req: NextRequest) {
  try {
    const cfg = (await req.json()) as ResultsConfig;
    saveResultsConfig(cfg);
    return NextResponse.json(cfg);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
