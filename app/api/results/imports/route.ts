import { NextResponse } from "next/server";
import { loadAllImports } from "@/lib/results/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET -> summary of every import done so far (newest first), without the
// full row list (that can be large; the ranking endpoint already uses it).
export async function GET() {
  const imports = loadAllImports()
    .slice()
    .reverse()
    .map((i) => ({
      data: i.data,
      arquivo: i.arquivo,
      total: i.linhas.length,
      reconhecidas: i.reconhecidas,
      naoReconhecidas: i.naoReconhecidas,
    }));
  return NextResponse.json({ imports });
}
