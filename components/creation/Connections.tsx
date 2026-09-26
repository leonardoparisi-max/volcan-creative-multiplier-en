"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import type { ComponentRow, Connections as Conns } from "@/lib/types";
import { planCombinations } from "@/lib/combinations";
import { previewText } from "./Kanban";

const key = (a: string, b: string) => `${a}|${b}`;

export function Connections({
  rows,
  connections,
  setConnections,
  onlyActive,
}: {
  rows: ComponentRow[];
  connections: Conns;
  setConnections: (c: Conns) => void;
  onlyActive: boolean;
}) {
  const filt = (r: ComponentRow) => (onlyActive ? r.ativo : true) && r.existe !== false;
  const hooks = rows.filter((r) => r.tipo === "hook" && filt(r));
  const bodies = rows.filter((r) => r.tipo === "body" && filt(r));
  const ctas = rows.filter((r) => r.tipo === "cta" && filt(r));

  const [sel, setSel] = useState<string>("");
  useEffect(() => {
    if ((!sel || !hooks.some((h) => h.id === sel)) && hooks[0]) setSel(hooks[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const cutsHB = useMemo(() => new Set(connections.cutsHookBody), [connections]);
  const cutsBC = useMemo(() => new Set(connections.cutsBodyCta), [connections]);

  const count = useMemo(
    () => planCombinations(rows, { connections }).count,
    [rows, connections]
  );

  function toggleBody(bid: string) {
    if (!sel) return;
    const k = key(sel, bid);
    const next = new Set(cutsHB);
    next.has(k) ? next.delete(k) : next.add(k);
    setConnections({ ...connections, cutsHookBody: [...next] });
  }

  // CTA is global: cutting it removes the body→cta edge for every body.
  function ctaLinked(cid: string) {
    return bodies.some((b) => !cutsBC.has(key(b.id, cid)));
  }
  function toggleCta(cid: string) {
    const next = new Set(cutsBC);
    if (ctaLinked(cid)) {
      for (const b of bodies) next.add(key(b.id, cid));
    } else {
      for (const b of bodies) next.delete(key(b.id, cid));
    }
    setConnections({ ...connections, cutsBodyCta: [...next] });
  }

  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          <b className="mr-1.5 font-bold text-primary">1</b>pick the hook
        </span>
        <span>
          <b className="mr-1.5 font-bold text-primary">2</b>toggle the bodies
        </span>
        <span>
          <b className="mr-1.5 font-bold text-primary">3</b>toggle the ctas
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3">
        {/* HOOK */}
        <Col n={1} label="Hook" hint="click to select">
          {hooks.map((h) => (
            <Node
              key={h.id}
              title={h.arquivo.replace(/\.[^.]+$/, "")}
              subtitle={previewText(h)}
              id={h.id}
              hash={h.hash}
              state={h.id === sel ? "selected" : "idle"}
              onClick={() => setSel(h.id)}
            />
          ))}
          {hooks.length === 0 && <Empty>no active hooks</Empty>}
        </Col>

        {/* BODY */}
        <Col n={2} label="Body" arrow divider>
          {bodies.map((b) => {
            const linked = sel ? !cutsHB.has(key(sel, b.id)) : false;
            return (
              <Node
                key={b.id}
                title={b.arquivo.replace(/\.[^.]+$/, "")}
                subtitle={previewText(b)}
                id={b.id}
                hash={b.hash}
                state={linked ? "linked" : "cut"}
                onClick={() => toggleBody(b.id)}
              />
            );
          })}
          {bodies.length === 0 && <Empty>no active bodies</Empty>}
        </Col>

        {/* CTA */}
        <Col n={3} label="CTA" arrow divider>
          {ctas.map((c) => {
            const linked = ctaLinked(c.id);
            return (
              <Node
                key={c.id}
                title={c.arquivo.replace(/\.[^.]+$/, "")}
                subtitle={previewText(c)}
                id={c.id}
                hash={c.hash}
                state={linked ? "linked" : "cut"}
                onClick={() => toggleCta(c.id)}
              />
            );
          })}
          {ctas.length === 0 && <Empty>no active ctas</Empty>}
        </Col>
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-border pt-3">
        <span className="text-sm font-semibold">
          Total: <b className="text-lg text-primary tabular-nums">{count}</b>{" "}
          combinations
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          everything starts connected — just cut what you don't want
        </span>
      </div>
    </div>
  );
}

function Col({
  n,
  label,
  hint,
  arrow,
  divider,
  children,
}: {
  n: number;
  label: string;
  hint?: string;
  arrow?: boolean;
  divider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`min-w-0 px-0 md:px-4 ${
        divider ? "md:border-l md:border-border pt-4 md:pt-0 border-t border-border md:border-t-0 mt-4 md:mt-0" : ""
      }`}
    >
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {arrow && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
        <span className="grid h-[18px] w-[18px] place-items-center rounded bg-secondary text-[10px] font-bold text-foreground">
          {n}
        </span>
        {label}
        {hint && (
          <span className="ml-auto text-[10.5px] font-medium normal-case tracking-normal text-muted-foreground/70">
            {hint}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Node({
  title,
  subtitle,
  id,
  hash,
  state,
  onClick,
}: {
  title: string;
  subtitle?: string;
  id: string;
  hash?: string;
  state: "idle" | "selected" | "linked" | "cut";
  onClick: () => void;
}) {
  const styles: Record<string, string> = {
    idle: "border-border bg-secondary/40 hover:border-muted-foreground/40",
    selected:
      "border-primary bg-primary/10 ring-1 ring-primary/40",
    linked: "border-emerald-500/40 bg-emerald-500/[0.07] hover:border-emerald-500/60",
    cut: "border-border bg-secondary/40 hover:border-muted-foreground/40",
  };
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${styles[state]}`}
    >
      <span className="relative h-9 w-6 shrink-0 overflow-hidden rounded bg-black">
        {hash && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/thumb?hash=${hash}`}
            alt={id}
            className="h-full w-full object-cover"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">{title}</span>
        {subtitle && (
          <span className="block truncate text-[10.5px] text-muted-foreground/70">
            {subtitle}
          </span>
        )}
      </span>
      <span className="text-[10.5px] font-bold text-muted-foreground">{id}</span>
      <span
        className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border transition ${
          state === "linked"
            ? "border-emerald-500 bg-emerald-500 text-black"
            : state === "selected"
            ? "border-primary bg-primary text-black"
            : "border-border text-transparent"
        }`}
      >
        {state === "linked" && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}
