import { NextRequest, NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { parseAdRows } from "@/lib/results/csvImport";
import { loadManifestCatalog } from "@/lib/results/manifests";
import { matchRow } from "@/lib/results/aggregate";
import { loadResultsConfig, saveResultsConfig, saveImportRecord } from "@/lib/results/store";
import type { ColumnMapping } from "@/lib/results/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { csvText, mapping, arquivo } -> parses fully, matches against every
// rendered creative, saves the import record and remembers the mapping used.
export async function POST(req: NextRequest) {
  try {
    const { csvText, mapping, arquivo } = (await req.json()) as {
      csvText: string;
      mapping: ColumnMapping;
      arquivo?: string;
    };
    if (!csvText || !mapping?.nome_anuncio || !mapping?.gasto || !mapping?.impressoes) {
      return NextResponse.json(
        { error: "map at least ad name, amount spent and impressions" },
        { status: 400 }
      );
    }
    const cfg = loadConfig();
    const linhas = parseAdRows(csvText, mapping);
    const catalog = loadManifestCatalog(cfg);
    let reconhecidas = 0;
    for (const l of linhas) {
      const id = matchRow(l, catalog);
      l.versao_id = id;
      l.matched = !!id;
      if (id) reconhecidas++;
    }

    const rec = {
      data: new Date().toISOString(),
      arquivo: arquivo || "import.csv",
      linhas,
      reconhecidas,
      naoReconhecidas: linhas.length - reconhecidas,
    };
    saveImportRecord(rec);

    const rcfg = loadResultsConfig();
    saveResultsConfig({ ...rcfg, mapeamento: mapping });

    return NextResponse.json({ ok: true, total: linhas.length, reconhecidas, naoReconhecidas: rec.naoReconhecidas });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
