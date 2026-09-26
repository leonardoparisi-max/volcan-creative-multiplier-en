"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Wrench } from "lucide-react";
import { api } from "@/lib/client";
import type { DoctorReport } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function DoctorBanner({
  onStatus,
}: {
  onStatus?: (ok: boolean | null) => void;
} = {}) {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    onStatus?.(null);
    try {
      const r = await api.doctor();
      setReport(r);
      onStatus?.(r.ok);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failing = report?.checks.filter((c) => !c.ok) ?? [];
  const allOk = report?.ok ?? false;

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        allOk
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Wrench className="h-4 w-4 opacity-70" />
          <span className="font-medium">Dependencies</span>
          {loading ? (
            <Badge variant="secondary">checking…</Badge>
          ) : allOk ? (
            <Badge variant="success">all set</Badge>
          ) : (
            <Badge variant="warn">{failing.length} issue(s)</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? "hide" : "details"}
          </Button>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" /> recheck
          </Button>
        </div>
      </div>

      {open && report && (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {report.checks.map((c) => (
            <div
              key={c.name}
              className="flex items-start gap-2 rounded-md bg-background/40 px-3 py-2 text-xs"
            >
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              )}
              <div className="min-w-0">
                <div className="font-medium">{c.name}</div>
                <div className="truncate text-muted-foreground mono">{c.detail}</div>
                {!c.ok && c.hint && (
                  <div className="mt-0.5 text-amber-400 mono">→ {c.hint}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
