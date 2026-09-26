"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import type {
  RankingResult,
  ComponentAggregate,
  CombinationAggregate,
} from "@/lib/results/types";
import { Segmented } from "@/components/ui/segmented";
import { Badge } from "@/components/ui/badge";

type Kind = "hook" | "body" | "cta" | "combination";

function fmtMoney(n: number | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number | undefined | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmtIdx(n: number | undefined | null): string {
  if (n == null) return "—";
  return `${n.toFixed(2)}×`;
}
function fmtInt(n: number | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function tierBadge(tier: 1 | 2 | 3) {
  if (tier === 3) return <Badge variant="success">tier 3</Badge>;
  if (tier === 2) return <Badge variant="warn">tier 2</Badge>;
  return <Badge variant="secondary">tier 1</Badge>;
}

interface Col<T> {
  key: string;
  label: string;
  value: (r: T) => number | undefined | null;
  fmt: (r: T) => string;
  bar?: boolean;
}

function componentCols(kind: "hook" | "body" | "cta"): Col<ComponentAggregate>[] {
  const primary: Col<ComponentAggregate> =
    kind === "hook"
      ? { key: "hook_rate", label: "hook rate", value: (r) => r.hook_rate, fmt: (r) => fmtPct(r.hook_rate), bar: true }
      : kind === "body"
      ? { key: "hold_rate", label: "hold rate", value: (r) => r.hold_rate, fmt: (r) => fmtPct(r.hold_rate), bar: true }
      : { key: "ctr", label: "CTR", value: (r) => r.ctr, fmt: (r) => fmtPct(r.ctr), bar: true };
  const idxKey = kind === "hook" ? "hook_rate" : kind === "body" ? "hold_rate" : "ctr";
  return [
    { key: "gasto", label: "spend", value: (r) => r.gasto, fmt: (r) => fmtMoney(r.gasto) },
    primary,
    { key: "idx", label: "index", value: (r) => r.idx[idxKey], fmt: (r) => fmtIdx(r.idx[idxKey]) },
    { key: "cost_per_result", label: "CPA", value: (r) => r.cost_per_result, fmt: (r) => fmtMoney(r.cost_per_result) },
    { key: "resultados", label: "results", value: (r) => r.resultados, fmt: (r) => fmtInt(r.resultados) },
  ];
}

const comboCols: Col<CombinationAggregate>[] = [
  { key: "gasto", label: "spend", value: (r) => r.gasto, fmt: (r) => fmtMoney(r.gasto) },
  {
    key: "cost_per_result",
    label: "CPA",
    value: (r) => (r.cost_per_result != null ? -r.cost_per_result : undefined),
    fmt: (r) => fmtMoney(r.cost_per_result),
    bar: true,
  },
  { key: "idx", label: "CPA index", value: (r) => r.idx.cost_per_result, fmt: (r) => fmtIdx(r.idx.cost_per_result) },
  { key: "resultados", label: "results", value: (r) => r.resultados, fmt: (r) => fmtInt(r.resultados) },
];

export function RankingPanel({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<RankingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<Kind>("hook");
  const [sortKey, setSortKey] = useState("gasto");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  useEffect(() => {
    setLoading(true);
    api
      .getRanking()
      .then(setData)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (kind === "combination") return data.combinations;
    return data[kind === "hook" ? "hooks" : kind === "body" ? "bodies" : "ctas"];
  }, [data, kind]);

  const cols = kind === "combination" ? comboCols : componentCols(kind as any);
  const activeCol = cols.find((c) => c.key === sortKey) ?? cols[0];

  const sorted = useMemo(() => {
    const list = [...rows] as (ComponentAggregate | CombinationAggregate)[];
    list.sort((a, b) => {
      const va = activeCol.value(a as any) ?? -Infinity;
      const vb = activeCol.value(b as any) ?? -Infinity;
      return (va - vb) * sortDir;
    });
    return list;
  }, [rows, activeCol, sortDir]);

  const maxBar = Math.max(1e-9, ...sorted.map((r) => Math.abs(activeCol.value(r as any) ?? 0)));

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> loading ranking…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={kind}
          onChange={(v) => {
            setKind(v as Kind);
            setSortKey("gasto");
            setSortDir(-1);
          }}
          options={[
            { value: "hook", label: "By hook" },
            { value: "body", label: "By body" },
            { value: "cta", label: "By CTA" },
            { value: "combination", label: "By combination" },
          ]}
        />
        <div className="text-xs text-muted-foreground">
          {data.totais.anuncios_reconhecidos} ad(s) matched
          {data.totais.anuncios_nao_reconhecidos > 0 && (
            <> · {data.totais.anuncios_nao_reconhecidos} unmatched</>
          )}
        </div>
      </div>

      {!sorted.length ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Not enough data yet — import a CSV with ads that match your rendered
          components.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[1.6fr_repeat(5,1fr)] gap-2 border-b border-border bg-secondary/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <div>{kind === "combination" ? "combination" : kind}</div>
            {cols.map((c) => (
              <button
                key={c.key}
                onClick={() => toggleSort(c.key)}
                className="flex items-center justify-end gap-1 text-right hover:text-foreground"
              >
                {c.label}
                {sortKey === c.key &&
                  (sortDir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
              </button>
            ))}
          </div>
          {sorted.map((r: any) => (
            <div
              key={r.id}
              className="grid grid-cols-[1.6fr_repeat(5,1fr)] items-center gap-2 border-b border-border px-3 py-2.5 text-[13px] last:border-0"
            >
              <div className="min-w-0">
                {kind === "combination" ? (
                  <div className="truncate font-medium">
                    {r.hook} × {r.body} × {r.cta}
                  </div>
                ) : (
                  <>
                    <div className="truncate font-medium">{r.id}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{r.texto}</div>
                  </>
                )}
                <div className="mt-1">{tierBadge(r.tier)}</div>
              </div>
              {cols.map((c) => {
                const v = c.value(r);
                const w = c.bar && v != null ? Math.min(100, (Math.abs(v) / maxBar) * 100) : 0;
                return (
                  <div key={c.key} className="text-right">
                    <div>{c.fmt(r)}</div>
                    {c.bar && (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="cc-grad h-full rounded-full" style={{ width: `${w}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {data.paired.length > 0 && (
        <div className="rounded-xl border border-border p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Paired comparisons ({data.paired.length})
          </p>
          <div className="space-y-1.5">
            {data.paired.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-[12.5px]">
                <span>
                  {p.variavel}: <b>{p.a.id}</b> vs <b>{p.b.id}</b> (fixed {p.fixo.join(" × ")})
                </span>
                <span className="text-muted-foreground">
                  winner <b className="text-foreground">{p.vencedor}</b> · {p.lift.toFixed(2)}× ·{" "}
                  {p.ambos_tier3 ? "both tier 3" : "partial signal"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data.untested.hooks.length || data.untested.bodies.length || data.untested.ctas.length) > 0 && (
        <div className="rounded-xl border border-dashed border-border p-4 text-[12.5px] text-muted-foreground">
          no data yet: {[...data.untested.hooks, ...data.untested.bodies, ...data.untested.ctas].join(", ")}
        </div>
      )}
    </div>
  );
}
