// ---------------------------------------------------------------------------
// Types for the "Results" feature: import ad performance, rank components,
// and generate/import the external-AI learning loop. No AI/API calls happen
// inside the app — it only prepares a prompt for the user to paste elsewhere,
// and parses what they paste back.
// ---------------------------------------------------------------------------

export type ComponentKindOrCombo = "hook" | "body" | "cta" | "combination";

/** Column mapping: internal field -> source CSV header name. */
export interface ColumnMapping {
  nome_anuncio: string;
  gasto: string;
  impressoes: string;
  reprod_3s?: string;
  thruplays?: string;
  tempo_medio?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  resultados?: string;
  custo_por_resultado?: string;
}

export const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: "nome_anuncio", label: "Ad name", required: true },
  { key: "gasto", label: "Amount spent", required: true },
  { key: "impressoes", label: "Impressions", required: true },
  { key: "reprod_3s", label: "3-second video plays" },
  { key: "thruplays", label: "ThruPlays" },
  { key: "tempo_medio", label: "Average play time" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "cpm", label: "CPM" },
  { key: "resultados", label: "Results" },
  { key: "custo_por_resultado", label: "Cost per result" },
];

export interface ImportedAdRow {
  nome_anuncio: string;
  gasto: number;
  impressoes: number;
  reprod_3s?: number;
  thruplays?: number;
  tempo_medio?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  resultados?: number;
  custo_por_resultado?: number;
  versao_id?: string;
  matched?: boolean;
}

export interface ImportRecord {
  data: string; // ISO datetime of the import
  arquivo: string; // original CSV filename
  linhas: ImportedAdRow[];
  reconhecidas: number;
  naoReconhecidas: number;
}

export interface TierConfig {
  t3_min_spend: number;
  t3_min_results: number;
  t2_min_spend: number;
  t2_min_results: number;
}

export interface ResultsConfig {
  contexto: {
    objetivo: string;
    oferta: string;
    publico: string;
    tipo_resultado: string; // e.g. "Lead (form)" — label only, for the prompt
  };
  tiers: TierConfig;
  mapeamento?: ColumnMapping;
  run_atual: number;
  /** Ids seen in the last generated prompt — diffed against the current ranking to build new_since_last_run. */
  conhecidos?: { hooks: string[]; bodies: string[]; ctas: string[]; combinations: string[] };
}

export const DEFAULT_RESULTS_CONFIG: ResultsConfig = {
  contexto: { objetivo: "", oferta: "", publico: "", tipo_resultado: "" },
  tiers: { t3_min_spend: 300, t3_min_results: 8, t2_min_spend: 100, t2_min_results: 3 },
  run_atual: 0,
};

export interface ComponentAggregate {
  id: string;
  tipo: "hook" | "body" | "cta";
  texto: string;
  /** Hooks only: how the on-screen text was produced (tarja|simples|legenda|nenhum) — hints at text_source for the prompt. */
  modo?: string;
  arquivo: string;
  gasto: number;
  impressoes: number;
  reprod_3s: number;
  thruplays: number;
  cliques: number;
  resultados: number;
  hook_rate?: number;
  hold_rate?: number;
  avg_watch?: number;
  ctr?: number;
  cost_per_3s?: number;
  cost_per_result?: number;
  idx: Record<string, number | null>;
  tier: 1 | 2 | 3;
  combos: number;
  driven_by_single_partner: boolean;
  origem_sugestao?: string;
}

export interface CombinationAggregate {
  id: string; // versao_id
  hook: string;
  body: string;
  cta: string;
  gasto: number;
  impressoes: number;
  reprod_3s: number;
  thruplays: number;
  cliques: number;
  resultados: number;
  cost_per_result?: number;
  idx: Record<string, number | null>;
  tier: 1 | 2 | 3;
}

export interface PairedComparison {
  variavel: "hook" | "body" | "cta";
  fixo: string[];
  a: { id: string; metrica: string; valor: number };
  b: { id: string; metrica: string; valor: number };
  vencedor: string;
  lift: number;
  ambos_tier3: boolean;
}

export interface Baseline {
  hook_rate: number;
  hold_rate: number | null;
  ctr: number | null;
  cpm: number | null;
  cost_per_result: number | null;
}

export interface RankingResult {
  baseline: Baseline;
  totais: { gasto: number; impressoes: number; resultados: number; anuncios_reconhecidos: number; anuncios_nao_reconhecidos: number };
  hooks: ComponentAggregate[];
  bodies: ComponentAggregate[];
  ctas: ComponentAggregate[];
  combinations: CombinationAggregate[];
  paired: PairedComparison[];
  untested: { hooks: string[]; bodies: string[]; ctas: string[] };
}

export type LearningStatus = "supported" | "weak" | "contradicted";

export interface Learning {
  id: string;
  component: "hook" | "body" | "cta" | "combination" | "geral";
  pattern: string;
  mechanism?: string;
  status: LearningStatus;
  confidence: number;
  evidence: {
    supporting: string[];
    contradicting: string[];
    total_spend?: number;
    n_tier3?: number;
  };
  first_seen_run: number;
  last_reviewed_run: number;
  history: { run: number; status: string }[];
}

export interface Suggestion {
  id: string;
  run: number;
  component: "hook" | "body" | "cta";
  draft: string;
  rationale?: string;
  tests_learning?: string;
  predicted?: string;
  produced_as?: string;
  outcome?: Record<string, any>;
}

export interface UntestedTerritory {
  id: string;
  note: string;
  added_run: number;
}

export interface Retired {
  id: string;
  reason: string;
  run: number;
}

export interface LearningsFile {
  version: number;
  updated_run: number;
  learnings: Learning[];
  suggestions: Suggestion[];
  untested_territory: UntestedTerritory[];
  retired: Retired[];
}

export const EMPTY_LEARNINGS: LearningsFile = {
  version: 1,
  updated_run: 0,
  learnings: [],
  suggestions: [],
  untested_territory: [],
  retired: [],
};
