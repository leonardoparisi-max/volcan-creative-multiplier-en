import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { loadComponentsCsv } from "@/lib/scan";
import { computeRanking } from "@/lib/results/aggregate";
import { loadResultsConfig, loadAllImports } from "@/lib/results/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cfg = loadConfig();
    const rows = loadComponentsCsv();
    const rcfg = loadResultsConfig();
    const allRows = loadAllImports().flatMap((imp) => imp.linhas);
    const ranking = computeRanking(cfg, rows, allRows, rcfg.tiers);
    return NextResponse.json(ranking);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
