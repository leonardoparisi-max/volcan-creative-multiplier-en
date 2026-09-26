import { extractVersaoId } from "./csvImport";
import { loadManifestCatalog, type ManifestCombo } from "./manifests";
import type { Config, ComponentRow } from "../types";
import type {
  ImportedAdRow,
  TierConfig,
  ComponentAggregate,
  CombinationAggregate,
  PairedComparison,
  Baseline,
  RankingResult,
} from "./types";

interface Sums {
  gasto: number;
  impressoes: number;
  reprod_3s: number;
  thruplays: number;
  cliques: number;
  impressoes_com_clique: number; // denominator for ctr (only rows that had click data)
  resultados: number;
}

function emptySums(): Sums {
  return { gasto: 0, impressoes: 0, reprod_3s: 0, thruplays: 0, cliques: 0, impressoes_com_clique: 0, resultados: 0 };
}

function addRow(s: Sums, r: ImportedAdRow) {
  s.gasto += r.gasto || 0;
  s.impressoes += r.impressoes || 0;
  s.reprod_3s += r.reprod_3s || 0;
  s.thruplays += r.thruplays || 0;
  s.resultados += r.resultados || 0;
  // reconstruct clicks so CTR aggregates correctly (sum of clicks / sum of
  // impressions), not an average of per-row percentages
  if (r.ctr != null) {
    s.cliques += r.ctr * (r.impressoes || 0);
    s.impressoes_com_clique += r.impressoes || 0;
  } else if (r.cpc != null && r.cpc > 0) {
    s.cliques += r.gasto / r.cpc;
    s.impressoes_com_clique += r.impressoes || 0;
  }
}

function tierOf(gasto: number, resultados: number, t: TierConfig): 1 | 2 | 3 {
  if (gasto >= t.t3_min_spend && resultados >= t.t3_min_results) return 3;
  if (gasto >= t.t2_min_spend && resultados >= t.t2_min_results) return 2;
  return 1;
}

function ratio(n: number, d: number): number | undefined {
  return d > 0 ? n / d : undefined;
}

/** Cost-style metrics are inverted so a HIGHER index always means better, matching rate-style metrics. */
function idxOf(value: number | undefined, baseline: number | null | undefined, invert: boolean): number | null {
  if (value == null || baseline == null || baseline === 0) return null;
  return invert ? baseline / value : value / baseline;
}

/** Best-effort match: versao_id embedded in the ad name, else a filename/id substring match. */
export function matchRow(row: ImportedAdRow, catalog: Map<string, ManifestCombo>): string | undefined {
  const v = extractVersaoId(row.nome_anuncio);
  if (v) {
    for (const [id, combo] of catalog) {
      if (id.toLowerCase() === v || combo.filename.toLowerCase().includes(`_v${v}`)) return id;
    }
  }
  const nome = row.nome_anuncio.toLowerCase();
  for (const [id, combo] of catalog) {
    const stem = combo.filename.replace(/\.[^.]+$/, "").toLowerCase();
    if (stem && (nome.includes(stem) || stem.includes(nome))) return id;
  }
  return undefined;
}

export function computeRanking(
  cfg: Config,
  rows: ComponentRow[],
  allImportedRows: ImportedAdRow[],
  tiers: TierConfig
): RankingResult {
  const catalog = loadManifestCatalog(cfg);

  const comboSums = new Map<string, Sums>();
  let naoReconhecidas = 0;
  for (const row of allImportedRows) {
    const id = matchRow(row, catalog);
    if (!id) {
      naoReconhecidas++;
      continue;
    }
    if (!comboSums.has(id)) comboSums.set(id, emptySums());
    addRow(comboSums.get(id)!, row);
  }

  // ---- baseline: totals across every matched combination ----
  const totalSums = emptySums();
  for (const s of comboSums.values()) {
    totalSums.gasto += s.gasto;
    totalSums.impressoes += s.impressoes;
    totalSums.reprod_3s += s.reprod_3s;
    totalSums.thruplays += s.thruplays;
    totalSums.cliques += s.cliques;
    totalSums.impressoes_com_clique += s.impressoes_com_clique;
    totalSums.resultados += s.resultados;
  }
  const baseline: Baseline = {
    hook_rate: ratio(totalSums.reprod_3s, totalSums.impressoes) ?? 0,
    hold_rate: ratio(totalSums.thruplays, totalSums.reprod_3s) ?? null,
    ctr: ratio(totalSums.cliques, totalSums.impressoes_com_clique) ?? null,
    cpm: totalSums.impressoes > 0 ? (totalSums.gasto / totalSums.impressoes) * 1000 : null,
    cost_per_result: totalSums.resultados > 0 ? totalSums.gasto / totalSums.resultados : null,
  };

  // ---- combinations ----
  const combinations: CombinationAggregate[] = [];
  for (const [id, s] of comboSums) {
    const combo = catalog.get(id);
    if (!combo) continue;
    const cost_per_result = s.resultados > 0 ? s.gasto / s.resultados : undefined;
    combinations.push({
      id,
      hook: combo.hook,
      body: combo.body,
      cta: combo.cta,
      gasto: s.gasto,
      impressoes: s.impressoes,
      reprod_3s: s.reprod_3s,
      thruplays: s.thruplays,
      cliques: s.cliques,
      resultados: s.resultados,
      cost_per_result,
      idx: { cost_per_result: idxOf(cost_per_result, baseline.cost_per_result, true) },
      tier: tierOf(s.gasto, s.resultados, tiers),
    });
  }

  // ---- per-component accumulation ----
  type Acc = { sums: Sums; comboGasto: Map<string, number>; texto: string; arquivo: string; modo?: string };
  const acc: Record<"hook" | "body" | "cta", Map<string, Acc>> = {
    hook: new Map(),
    body: new Map(),
    cta: new Map(),
  };
  const bump = (
    kind: "hook" | "body" | "cta",
    id: string,
    comboId: string,
    s: Sums,
    texto: string,
    arquivo: string,
    modo?: string
  ) => {
    if (!id) return;
    if (!acc[kind].has(id)) acc[kind].set(id, { sums: emptySums(), comboGasto: new Map(), texto, arquivo, modo });
    const a = acc[kind].get(id)!;
    if (modo) a.modo = modo;
    a.sums.gasto += s.gasto;
    a.sums.impressoes += s.impressoes;
    a.sums.reprod_3s += s.reprod_3s;
    a.sums.thruplays += s.thruplays;
    a.sums.cliques += s.cliques;
    a.sums.impressoes_com_clique += s.impressoes_com_clique;
    a.sums.resultados += s.resultados;
    a.comboGasto.set(comboId, (a.comboGasto.get(comboId) ?? 0) + s.gasto);
    if (texto) a.texto = texto; // most-recently-seen combo's text wins
  };
  for (const [id, s] of comboSums) {
    const combo = catalog.get(id);
    if (!combo) continue;
    bump("hook", combo.hook, id, s, combo.hook_texto, combo.filename, combo.hook_modo);
    bump("body", combo.body, id, s, combo.body_texto, combo.filename);
    bump("cta", combo.cta, id, s, combo.cta_texto, combo.filename);
  }

  function buildComponents(kind: "hook" | "body" | "cta"): ComponentAggregate[] {
    const out: ComponentAggregate[] = [];
    for (const [id, a] of acc[kind]) {
      const s = a.sums;
      const hook_rate = ratio(s.reprod_3s, s.impressoes);
      const hold_rate = ratio(s.thruplays, s.reprod_3s);
      const ctr = ratio(s.cliques, s.impressoes_com_clique);
      const cost_per_3s = s.reprod_3s > 0 ? s.gasto / s.reprod_3s : undefined;
      const cost_per_result = s.resultados > 0 ? s.gasto / s.resultados : undefined;
      const avg_watch = undefined; // Meta's "avg play time" isn't reliably summable across ads; omitted rather than faked
      let maxCombo = 0;
      for (const g of a.comboGasto.values()) maxCombo = Math.max(maxCombo, g);
      const driven = s.gasto > 0 && maxCombo / s.gasto > 0.7 && a.comboGasto.size > 1;
      // cost_per_3s has no account-wide baseline computed above (the baseline tracks 3s-play
      // RATE, not cost-per-3s), so it's reported raw (below) without an index.
      const idx: Record<string, number | null> = {
        hook_rate: idxOf(hook_rate, baseline.hook_rate, false),
        hold_rate: idxOf(hold_rate, baseline.hold_rate, false),
        ctr: idxOf(ctr, baseline.ctr, false),
        cost_per_result: idxOf(cost_per_result, baseline.cost_per_result, true),
      };
      out.push({
        id,
        tipo: kind,
        texto: a.texto,
        modo: a.modo,
        arquivo: a.arquivo,
        gasto: s.gasto,
        impressoes: s.impressoes,
        reprod_3s: s.reprod_3s,
        thruplays: s.thruplays,
        cliques: s.cliques,
        resultados: s.resultados,
        hook_rate,
        hold_rate,
        avg_watch,
        ctr,
        cost_per_3s,
        cost_per_result,
        idx,
        tier: tierOf(s.gasto, s.resultados, tiers),
        combos: a.comboGasto.size,
        driven_by_single_partner: driven,
      });
    }
    // primary metric per kind, descending
    const primary = kind === "hook" ? "hook_rate" : kind === "body" ? "hold_rate" : "ctr";
    out.sort((x, y) => ((y as any)[primary] ?? -1) - ((x as any)[primary] ?? -1));
    return out;
  }

  const hooks = buildComponents("hook");
  const bodies = buildComponents("body");
  const ctas = buildComponents("cta");

  // ---- paired comparisons: same other two components, one variable changed ----
  const paired: PairedComparison[] = [];
  function primaryMetricOwn(kind: "hook" | "body" | "cta", s: Sums): number | undefined {
    if (kind === "hook") return ratio(s.reprod_3s, s.impressoes);
    if (kind === "body") return ratio(s.thruplays, s.reprod_3s);
    return ratio(s.cliques, s.impressoes_com_clique);
  }
  function groupBy(varying: "hook" | "body" | "cta") {
    const groups = new Map<string, { id: string; s: Sums; tier: 1 | 2 | 3 }[]>();
    for (const [id, s] of comboSums) {
      const combo = catalog.get(id);
      if (!combo) continue;
      const fixed =
        varying === "hook"
          ? `${combo.body}|${combo.cta}`
          : varying === "body"
          ? `${combo.hook}|${combo.cta}`
          : `${combo.hook}|${combo.body}`;
      const varId = varying === "hook" ? combo.hook : varying === "body" ? combo.body : combo.cta;
      if (!varId) continue;
      if (!groups.has(fixed)) groups.set(fixed, []);
      groups.get(fixed)!.push({ id: varId, s, tier: tierOf(s.gasto, s.resultados, tiers) });
    }
    return groups;
  }
  const metricName = { hook: "hook_rate", body: "hold_rate", cta: "ctr" } as const;
  for (const varying of ["hook", "body", "cta"] as const) {
    for (const [fixedKey, items] of groupBy(varying)) {
      const byComponent = new Map<string, Sums>();
      for (const it of items) {
        if (!byComponent.has(it.id)) byComponent.set(it.id, emptySums());
        const acc2 = byComponent.get(it.id)!;
        acc2.gasto += it.s.gasto;
        acc2.impressoes += it.s.impressoes;
        acc2.reprod_3s += it.s.reprod_3s;
        acc2.thruplays += it.s.thruplays;
        acc2.cliques += it.s.cliques;
        acc2.impressoes_com_clique += it.s.impressoes_com_clique;
        acc2.resultados += it.s.resultados;
      }
      const ids = [...byComponent.keys()];
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const sa = byComponent.get(ids[i])!;
          const sb = byComponent.get(ids[j])!;
          const va = primaryMetricOwn(varying, sa);
          const vb = primaryMetricOwn(varying, sb);
          if (va == null || vb == null || va === 0 || vb === 0) continue;
          const ta = tierOf(sa.gasto, sa.resultados, tiers);
          const tb = tierOf(sb.gasto, sb.resultados, tiers);
          if (ta < 2 || tb < 2) continue;
          const [winner, winVal, loseVal] = va >= vb ? [ids[i], va, vb] : [ids[j], vb, va];
          paired.push({
            variavel: varying,
            fixo: fixedKey.split("|"),
            a: { id: ids[i], metrica: metricName[varying], valor: va },
            b: { id: ids[j], metrica: metricName[varying], valor: vb },
            vencedor: winner,
            lift: loseVal > 0 ? winVal / loseVal : 0,
            ambos_tier3: ta === 3 && tb === 3,
          });
        }
      }
    }
  }

  // ---- untested: active components with zero matched spend ----
  const testedIds = { hook: new Set(hooks.map((h) => h.id)), body: new Set(bodies.map((b) => b.id)), cta: new Set(ctas.map((c) => c.id)) };
  const untested = {
    hooks: rows.filter((r) => r.tipo === "hook" && r.ativo && !testedIds.hook.has(r.id)).map((r) => r.id),
    bodies: rows.filter((r) => r.tipo === "body" && r.ativo && !testedIds.body.has(r.id)).map((r) => r.id),
    ctas: rows.filter((r) => r.tipo === "cta" && r.ativo && !testedIds.cta.has(r.id)).map((r) => r.id),
  };

  return {
    baseline,
    totais: {
      gasto: totalSums.gasto,
      impressoes: totalSums.impressoes,
      resultados: totalSums.resultados,
      anuncios_reconhecidos: allImportedRows.length - naoReconhecidas,
      anuncios_nao_reconhecidos: naoReconhecidas,
    },
    hooks,
    bodies,
    ctas,
    combinations,
    paired,
    untested,
  };
}
