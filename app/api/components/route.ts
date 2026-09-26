import { NextRequest, NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { scanComponents, writeComponentsCsv, loadComponentsCsv } from "@/lib/scan";
import type { ComponentRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET returns enriched rows (duration/hash/thumb ready), scanning disk with the
// per-hash cache so repeat calls are cheap.
export async function GET() {
  try {
    const cfg = loadConfig();
    const rows = await scanComponents(cfg);
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

// PUT persists edited rows to components.csv without re-hashing (fast save).
export async function PUT(req: NextRequest) {
  try {
    const { rows } = (await req.json()) as { rows: ComponentRow[] };
    // Preserve on-disk order/ids; only the editable columns are trusted here.
    const existing = loadComponentsCsv();
    const byId = new Map(existing.map((r) => [r.id, r]));
    for (const r of rows) {
      const base = byId.get(r.id);
      if (!base) continue;
      base.legenda_ativa = r.legenda_ativa;
      base.texto_overlay = r.texto_overlay ?? "";
      base.texto_estilo = r.texto_estilo ?? "tarja";
      base.texto_posicao = r.texto_posicao ?? 0.66;
      base.layout = r.layout ?? "cheio";
      base.imagem = r.imagem ?? "";
      base.split_mudo = r.split_mudo ?? true;
      base.divisao = r.divisao ?? 0.55;
      base.foco_video = r.foco_video ?? 0.5;
      base.foco_imagem = r.foco_imagem ?? 0.5;
      base.ativo = r.ativo;
      base.incompativel_com = (r.incompativel_com ?? []).map((s) =>
        s.trim().toUpperCase()
      );
      base.punch_in = r.punch_in;
      base.origem_sugestao = r.origem_sugestao;
    }
    writeComponentsCsv([...byId.values()]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
