import { parseCsv } from "../csv";
import type { ColumnMapping, ImportedAdRow } from "./types";

/**
 * Known Meta Ads Manager header aliases (PT + EN exports), lowercased for
 * matching. Used to autodetect the column mapping so the user usually only
 * has to confirm, not build it by hand.
 */
const ALIASES: Record<keyof ColumnMapping, string[]> = {
  nome_anuncio: ["nome do anúncio", "nome do anuncio", "ad name"],
  gasto: ["valor usado (brl)", "valor gasto", "amount spent", "amount spent (brl)", "amount spent (usd)"],
  impressoes: ["impressões", "impressoes", "impressions"],
  reprod_3s: [
    "reproduções de vídeo de 3 segundos",
    "reproducoes de video de 3 segundos",
    "3-second video plays",
  ],
  thruplays: ["thruplays"],
  tempo_medio: [
    "tempo médio de reprodução do vídeo",
    "tempo medio de reproducao do video",
    "average play time",
  ],
  ctr: ["ctr (todos)", "ctr (all)", "ctr"],
  cpc: ["cpc (todos)", "cpc (all)", "cpc"],
  cpm: ["cpm (custo por 1.000 impressões)", "cpm"],
  resultados: ["resultados", "results"],
  custo_por_resultado: ["custo por resultado", "cost per result"],
};

/** Best-effort autodetected mapping from a header row, matched by exact/substring against known aliases. */
export function autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
  const norm = (s: string) => s.trim().toLowerCase();
  const headersNorm = headers.map(norm);
  const out: Partial<ColumnMapping> = {};
  for (const key of Object.keys(ALIASES) as (keyof ColumnMapping)[]) {
    for (const alias of ALIASES[key]) {
      const i = headersNorm.findIndex((h) => h === alias || h.includes(alias));
      if (i >= 0) {
        out[key] = headers[i];
        break;
      }
    }
  }
  return out;
}

/**
 * Meta's CSV export uses locale-dependent numbers: PT-BR "1.234,56" (dot
 * thousands, comma decimal) vs EN "1,234.56" (comma thousands, dot decimal).
 * Strips currency symbols/percent signs, then picks the right interpretation.
 */
export function parseLocaleNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  let s = raw.trim();
  if (!s) return undefined;
  s = s.replace(/[R$€£%\s]/g, "");
  if (!s) return undefined;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // whichever separator appears LAST is the decimal one
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (hasComma) {
    // comma only: decimal if followed by 1-2 digits at the end, else thousands
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    // dot only: PT-BR thousands grouping ("10.000", "1.234.567") looks like
    // repeated exact-3-digit groups — anything else (e.g. "4.17") is decimal.
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

/** CTR/percentage cells sometimes come as "1.23%" (already a %) or "0.0123" (fraction). Normalize to a fraction. */
function parsePercent(raw: string | undefined): number | undefined {
  const n = parseLocaleNumber(raw);
  if (n == null) return undefined;
  return raw && raw.includes("%") ? n / 100 : n > 1 ? n / 100 : n;
}

export interface ParsedCsv {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
}

/** First pass: just the headers + a few sample rows, for the mapping UI. */
export function inspectCsv(text: string): ParsedCsv {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], sampleRows: [], totalRows: 0 };
  return {
    headers: rows[0],
    sampleRows: rows.slice(1, 4),
    totalRows: rows.length - 1,
  };
}

/** Full parse against a confirmed mapping. */
export function parseAdRows(text: string, mapping: ColumnMapping): ImportedAdRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0];
  const idx = (name?: string) => (name ? header.indexOf(name) : -1);
  const iNome = idx(mapping.nome_anuncio);
  const iGasto = idx(mapping.gasto);
  const iImpr = idx(mapping.impressoes);
  const i3s = idx(mapping.reprod_3s);
  const iThru = idx(mapping.thruplays);
  const iTempo = idx(mapping.tempo_medio);
  const iCtr = idx(mapping.ctr);
  const iCpc = idx(mapping.cpc);
  const iCpm = idx(mapping.cpm);
  const iRes = idx(mapping.resultados);
  const iCpr = idx(mapping.custo_por_resultado);

  const out: ImportedAdRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const nome = iNome >= 0 ? (row[iNome] ?? "").trim() : "";
    if (!nome) continue;
    out.push({
      nome_anuncio: nome,
      gasto: parseLocaleNumber(row[iGasto]) ?? 0,
      impressoes: parseLocaleNumber(row[iImpr]) ?? 0,
      reprod_3s: i3s >= 0 ? parseLocaleNumber(row[i3s]) : undefined,
      thruplays: iThru >= 0 ? parseLocaleNumber(row[iThru]) : undefined,
      tempo_medio: iTempo >= 0 ? parseLocaleNumber(row[iTempo]) : undefined,
      ctr: iCtr >= 0 ? parsePercent(row[iCtr]) : undefined,
      cpc: iCpc >= 0 ? parseLocaleNumber(row[iCpc]) : undefined,
      cpm: iCpm >= 0 ? parseLocaleNumber(row[iCpm]) : undefined,
      resultados: iRes >= 0 ? parseLocaleNumber(row[iRes]) : undefined,
      custo_por_resultado: iCpr >= 0 ? parseLocaleNumber(row[iCpr]) : undefined,
    });
  }
  return out;
}

/** versao_id is embedded in the filename as "_v<8 hex>" — renderFilename + jobs.ts always add it. */
export function extractVersaoId(nomeAnuncio: string): string | undefined {
  const m = /_v([0-9a-f]{8})\b/i.exec(nomeAnuncio);
  return m ? m[1].toLowerCase() : undefined;
}
