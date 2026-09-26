import type { ComponentRow, Combination, Connections } from "./types";

// Kept local (not imported from ./connections) so this module stays free of
// node-only deps and can run in the client bundle for the live count.
const edgeKey = (a: string, b: string) => `${a}|${b}`;

export interface PlanOptions {
  connections?: Connections;
  /** filename pattern, tokens: {hook} {body} {cta} {n} {prefixo} */
  pattern?: string;
  prefixo?: string;
}

const DEFAULT_PATTERN = "{hook}_{body}_{cta}";

/** Sanitize a string for use as a filename segment. */
function safe(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Build the output filename from the pattern + tokens. Always ends in .mp4. */
export function renderFilename(
  opts: PlanOptions,
  tokens: { hook: string; body: string; cta: string; n: number }
): string {
  const pat = (opts.pattern || DEFAULT_PATTERN).trim() || DEFAULT_PATTERN;
  let name = pat
    .replace(/\{hook\}/g, tokens.hook)
    .replace(/\{body\}/g, tokens.body)
    .replace(/\{cta\}/g, tokens.cta)
    .replace(/\{n\}/g, String(tokens.n).padStart(3, "0"))
    .replace(/\{prefixo\}/g, opts.prefixo || "");
  if (opts.prefixo && !pat.includes("{prefixo}")) {
    name = `${opts.prefixo}_${name}`;
  }
  name = safe(name);
  if (!name) name = `${tokens.hook}_${tokens.body}_${tokens.cta}`;
  return name.toLowerCase().endsWith(".mp4") ? name : `${name}.mp4`;
}

export interface CombinationPlan {
  combinations: Combination[];
  count: number;
  hooks: number;
  bodies: number;
  ctas: number;
  skippedIncompatible: number;
}

/**
 * Build the valid creatives. A creative is a path hook→body→cta where neither
 * edge is cut in the connection graph (edges are ON by default). Legacy
 * `incompativel_com` pairs are also honored as implicit cuts, so old data keeps
 * working.
 */
export function planCombinations(
  rows: ComponentRow[],
  opts: PlanOptions = {}
): CombinationPlan {
  const active = rows.filter((r) => r.ativo && r.existe !== false && !r.erro);
  const hooks = active.filter((r) => r.tipo === "hook");
  const bodies = active.filter((r) => r.tipo === "body");
  const ctas = active.filter((r) => r.tipo === "cta");

  const cutsHB = new Set(opts.connections?.cutsHookBody ?? []);
  const cutsBC = new Set(opts.connections?.cutsBodyCta ?? []);

  // legacy incompatibility → treated as a cut in both directions
  const incompat = (a: ComponentRow, b: ComponentRow) => {
    const A = new Set(a.incompativel_com ?? []);
    const B = new Set(b.incompativel_com ?? []);
    return A.has(b.id) || B.has(a.id);
  };

  const combinations: Combination[] = [];
  let skipped = 0;
  let n = 0;

  for (const h of hooks) {
    for (const b of bodies) {
      if (cutsHB.has(edgeKey(h.id, b.id)) || incompat(h, b)) {
        skipped += ctas.length;
        continue;
      }
      for (const c of ctas) {
        if (cutsBC.has(edgeKey(b.id, c.id)) || incompat(b, c) || incompat(h, c)) {
          skipped++;
          continue;
        }
        n++;
        combinations.push({
          filename: renderFilename(opts, {
            hook: h.id,
            body: b.id,
            cta: c.id,
            n,
          }),
          hook: h.id,
          body: b.id,
          cta: c.id,
        });
      }
    }
  }

  return {
    combinations,
    count: combinations.length,
    hooks: hooks.length,
    bodies: bodies.length,
    ctas: ctas.length,
    skippedIncompatible: skipped,
  };
}
