import { NextRequest, NextResponse } from "next/server";
import { loadConfig, saveConfig } from "@/lib/config";
import type { Config } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(loadConfig());
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Config;
    saveConfig(body);
    return NextResponse.json(loadConfig());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
