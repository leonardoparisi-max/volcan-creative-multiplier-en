import { NextRequest, NextResponse } from "next/server";
import { loadConnections, saveConnections, pruneConnections } from "@/lib/connections";
import { loadComponentsCsv } from "@/lib/scan";
import type { Connections } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = loadComponentsCsv();
  const pruned = pruneConnections(loadConnections(), rows);
  return NextResponse.json(pruned);
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Connections;
    saveConnections({
      cutsHookBody: body.cutsHookBody ?? [],
      cutsBodyCta: body.cutsBodyCta ?? [],
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
