import { NextRequest, NextResponse } from "next/server";
import { inspectCsv, autoDetectMapping } from "@/lib/results/csvImport";
import { loadResultsConfig } from "@/lib/results/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { csvText } -> headers + sample rows + a starting column mapping
// (autodetected, falling back to the last mapping used for headers it can't
// place on its own).
export async function POST(req: NextRequest) {
  try {
    const { csvText } = (await req.json()) as { csvText: string };
    if (!csvText) return NextResponse.json({ error: "csvText missing" }, { status: 400 });
    const { headers, sampleRows, totalRows } = inspectCsv(csvText);
    if (!headers.length) return NextResponse.json({ error: "empty or unreadable CSV" }, { status: 400 });
    const detected = autoDetectMapping(headers);
    const last = loadResultsConfig().mapeamento;
    const mapping = { ...last, ...detected };
    return NextResponse.json({ headers, sampleRows, totalRows, mapping });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
