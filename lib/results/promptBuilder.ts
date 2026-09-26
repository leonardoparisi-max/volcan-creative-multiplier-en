import type { ComponentRow } from "../types";
import type {
  ResultsConfig,
  RankingResult,
  LearningsFile,
  ComponentAggregate,
  CombinationAggregate,
} from "./types";

const TRUNCATE_LEN = 80;

function truncate(s: string, n = TRUNCATE_LEN): string {
  const t = (s || "").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function round2(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function textSource(modo?: string): string {
  if (!modo) return "unknown";
  return modo === "legenda" ? "transcript" : modo === "nenhum" ? "none" : "on_screen";
}

/** Full text goes to the top/bottom 5 by the kind's primary metric, plus anything new since the last run. Everything else is truncated. */
function fullTextIds(list: ComponentAggregate[], newIds: Set<string>): Set<string> {
  const tested = list.filter((c) => c.tier >= 2);
  const out = new Set(newIds);
  for (const c of tested.slice(0, 5)) out.add(c.id);
  for (const c of tested.slice(-5)) out.add(c.id);
  return out;
}

function componentBlock(list: ComponentAggregate[], newIds: Set<string>, rows: ComponentRow[]) {
  const full = fullTextIds(list, newIds);
  return list
    .filter((c) => c.tier >= 2)
    .map((c) => {
      const row = rows.find((r) => r.id === c.id);
      const base: Record<string, any> = {
        id: c.id,
        text: full.has(c.id) ? c.texto : truncate(c.texto),
        text_source: textSource(c.modo),
        tier: c.tier,
        spend: round2(c.gasto),
        impressions: Math.round(c.impressoes),
        results: Math.round(c.resultados),
        combos: c.combos,
        driven_by_single_partner: c.driven_by_single_partner,
        cost_per_result_idx: round2(c.idx.cost_per_result),
      };
      if (row?.origem_sugestao) base.origin = `suggestion ${row.origem_sugestao}`;
      if (c.tipo === "hook") {
        base.plays_3s = Math.round(c.reprod_3s);
        base.hook_rate_idx = round2(c.idx.hook_rate);
      } else if (c.tipo === "body") {
        base.thruplays = Math.round(c.thruplays);
        base.hold_rate_idx = round2(c.idx.hold_rate);
      } else {
        base.clicks = Math.round(c.cliques);
        base.ctr_idx = round2(c.idx.ctr);
      }
      return base;
    });
}

function tier1Summary(list: ComponentAggregate[]) {
  const ids = list.filter((c) => c.tier === 1).map((c) => c.id);
  return { count: ids.length, ids };
}

function combinationBlock(list: CombinationAggregate[]) {
  return list
    .filter((c) => c.tier >= 2)
    .map((c) => ({
      id: c.id,
      hook: c.hook,
      body: c.body,
      cta: c.cta,
      tier: c.tier,
      spend: round2(c.gasto),
      results: Math.round(c.resultados),
      cost_per_result_idx: round2(c.idx.cost_per_result),
    }));
}

export interface DataBlock {
  meta: {
    run_id: number;
    imports_considered: number;
    last_import: string;
    objective: string;
    result_type: string;
    offer: string;
    audience: string;
    account_baseline: RankingResult["baseline"];
    tiers: ResultsConfig["tiers"];
  };
  hooks: any[];
  bodies: any[];
  ctas: any[];
  combinations: any[];
  tier1: { hooks: any; bodies: any; ctas: any };
  paired_comparisons: RankingResult["paired"];
  untested: RankingResult["untested"];
  new_since_last_run: string[];
}

export function buildDataBlock(
  resultsCfg: ResultsConfig,
  ranking: RankingResult,
  rows: ComponentRow[],
  run: number,
  importsConsidered: number,
  lastImportDate: string
): DataBlock {
  const known = resultsCfg.conhecidos ?? { hooks: [], bodies: [], ctas: [], combinations: [] };
  const newHooks = new Set(ranking.hooks.filter((h) => h.tier >= 2 && !known.hooks.includes(h.id)).map((h) => h.id));
  const newBodies = new Set(ranking.bodies.filter((b) => b.tier >= 2 && !known.bodies.includes(b.id)).map((b) => b.id));
  const newCtas = new Set(ranking.ctas.filter((c) => c.tier >= 2 && !known.ctas.includes(c.id)).map((c) => c.id));
  const newCombos = ranking.combinations.filter((c) => c.tier >= 2 && !known.combinations.includes(c.id)).map((c) => c.id);

  return {
    meta: {
      run_id: run,
      imports_considered: importsConsidered,
      last_import: lastImportDate,
      objective: resultsCfg.contexto.objetivo,
      result_type: resultsCfg.contexto.tipo_resultado,
      offer: resultsCfg.contexto.oferta,
      audience: resultsCfg.contexto.publico,
      account_baseline: ranking.baseline,
      tiers: resultsCfg.tiers,
    },
    hooks: componentBlock(ranking.hooks, newHooks, rows),
    bodies: componentBlock(ranking.bodies, newBodies, rows),
    ctas: componentBlock(ranking.ctas, newCtas, rows),
    combinations: combinationBlock(ranking.combinations),
    tier1: { hooks: tier1Summary(ranking.hooks), bodies: tier1Summary(ranking.bodies), ctas: tier1Summary(ranking.ctas) },
    paired_comparisons: ranking.paired,
    untested: ranking.untested,
    new_since_last_run: [...newHooks, ...newBodies, ...newCtas, ...newCombos],
  };
}

const HOW_TO_READ = `How to read the data:
- Every _idx field is an INDEX against the account baseline for the imports
  considered (1.00 = average, 1.30 = 30% better than average). Cost indices
  (cost_per_result_idx) are already inverted so higher always means better —
  never re-invert them.
- Each component owns one funnel stage. Judge hooks by hook_rate_idx, bodies
  by hold_rate_idx, CTAs by ctr_idx. Use cost_per_result_idx mainly for full
  combinations; a component's own cost_per_result_idx is a secondary signal.
- tier: 3 = reliable (meets the spend+results thresholds in meta.tiers),
  2 = readable but thinner, 1 = untested/too little spend — tier 1 items are
  NOT included individually (see the "tier1" block, counts and ids only).
  Derive patterns ONLY from tier-3 evidence; use tier-2 as supporting signal;
  never cite tier-1 as evidence for anything.
- paired_comparisons are controlled tests: same other two components, one
  variable changed. Weight these above aggregate metrics when they exist —
  they isolate the effect of the one thing that changed.
- driven_by_single_partner: true means most of a component's spend came from
  one combination — its number may really be about that pairing, not the
  component alone. Discount evidence from these accordingly.
- text_source: "on_screen" (a written hook/overlay), "transcript" (spoken,
  auto-captioned), or "none". Judge on_screen and transcript hooks separately
  if you don't have enough of both to compare directly.`;

const ANALYSIS_PROTOCOL = `Analysis protocol, follow this order:
1. Review each existing learning in ACCUMULATED LEARNINGS against the new
   data: confirm, weaken, contradict, or retire it. Cite evidence ids.
2. Score PREVIOUS SUGGESTIONS that were produced (produced_as is set): did
   the predicted outcome hold? State what that says about the reasoning that
   produced the suggestion.
3. Find NEW patterns using only tier-3 data (tier-2 as support). A pattern
   needs at least 3 supporting items OR 1 paired comparison. State the
   mechanism (why it would work for this audience/offer), not just the
   correlation.
4. Identify what has NOT been tested yet (see "untested" and think about
   angles/tones/structures absent from the tested set entirely).
5. Only then, generate suggestions for the next round.`;

const OUTPUT_FORMAT = `Answer in two parts, in this exact order.

## PART A: Analysis (for the human)
### Learning updates
One line per existing learning reviewed: id -> new status (confidence).
Why, citing evidence ids.
### Scorecard of previous suggestions
One line per produced suggestion: id -> produced as <component id>,
prediction held? (yes/no), why.
### New patterns (tier 3 only)
pattern -> mechanism -> evidence ids -> confidence.
### What's still untested
Short list.
### Suggestions for next round
For each: draft text -> which learning it exploits or which gap it
explores -> predicted metric (e.g. "hook_rate_idx > 1.2") -> what would
prove it wrong. Aim for roughly 60% exploit (remixing what's working) and
40% explore (untested territory).

## PART B: Machine block
Everything the tool needs to import, as ONE JSON object between the
delimiters below. Match this shape exactly (ids you invent for new
learnings/suggestions must be unique strings, e.g. "L010", "R{run}-S1"):

===LEARNINGS_UPDATE===
{
  "learnings": [
    {
      "id": "L004",
      "component": "hook",
      "pattern": "short description of the pattern",
      "mechanism": "why it works for this audience",
      "status": "supported",
      "confidence": 0.8,
      "evidence": { "supporting": ["H014","H011"], "contradicting": [], "total_spend": 3900, "n_tier3": 4 }
    }
  ],
  "suggestions": [
    {
      "id": "R{run}-S1",
      "component": "hook",
      "draft": "the new hook text/script",
      "rationale": "which learning this tests or which gap it explores",
      "tests_learning": "L004",
      "predicted": "hook_rate_idx > 1.2"
    }
  ],
  "untested_territory": [ { "id": "U001", "note": "short description" } ],
  "retired": [ { "id": "L001", "reason": "why, citing evidence" } ]
}
===END===

Only include learnings you are creating or changing (omit untouched ones —
the tool keeps everything else as-is). status must be one of: supported,
weak, contradicted. confidence is 0-1.`;

export function buildPromptText(
  resultsCfg: ResultsConfig,
  ranking: RankingResult,
  learnings: LearningsFile,
  data: DataBlock,
  run: number
): string {
  const active = learnings.learnings
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .map(
      (l) =>
        `- ${l.id} [${l.status}, ${l.confidence}]: ${l.pattern}${l.mechanism ? ` — mechanism: ${l.mechanism}` : ""} (evidence: ${l.evidence.supporting.join(", ") || "none"}${l.evidence.n_tier3 != null ? `; n_tier3=${l.evidence.n_tier3}` : ""}${l.evidence.total_spend != null ? `; spend=${l.evidence.total_spend}` : ""})`
    );
  const retiredLines = learnings.retired.map((r) => `- ${r.id} (retired, run ${r.run}): ${r.reason}`);

  const produced = learnings.suggestions.filter((s) => s.produced_as);
  const pending = learnings.suggestions.filter((s) => !s.produced_as);
  const suggestionLines = [
    ...produced.map(
      (s) =>
        `- ${s.id} [${s.component}] -> produced as ${s.produced_as}${s.outcome ? ` -> outcome: ${JSON.stringify(s.outcome)}` : " -> outcome not measured yet"} (predicted: ${s.predicted ?? "n/a"})`
    ),
    ...pending.map((s) => `- ${s.id} [${s.component}] -> not yet produced: "${truncate(s.draft, 60)}"`),
  ];

  return `# Ad-creative learning analysis — run ${run}

## [1] Role and task
You are a direct-response creative strategist. You will read performance
data for a set of video-ad components (hooks, bodies, CTAs) tested by
combination, plus what this account has already learned. Your job: update
the learnings with the new evidence, score last round's suggestions, find
new evidence-backed patterns, and propose the next round of creative drafts.

## [2] Context
- Objective: ${resultsCfg.contexto.objetivo || "(not set)"}
- Result type tracked: ${resultsCfg.contexto.tipo_resultado || "(not set)"}
- Offer: ${resultsCfg.contexto.oferta || "(not set)"}
- Audience: ${resultsCfg.contexto.publico || "(not set)"}
- Data considered: ${data.meta.imports_considered} import(s), most recent ${data.meta.last_import || "n/a"}

## [3] How to read the data
${HOW_TO_READ}

## [4] Accumulated learnings
${active.length ? active.join("\n") : "(none yet — this is the first run)"}
${retiredLines.length ? `\nRetired (do not re-propose these patterns):\n${retiredLines.join("\n")}` : ""}

## [5] Previous suggestions
${suggestionLines.length ? suggestionLines.join("\n") : "(none yet — this is the first run)"}

## [6] Data
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

## [7] Analysis protocol
${ANALYSIS_PROTOCOL}

## [8] Output format
${OUTPUT_FORMAT}
`;
}
