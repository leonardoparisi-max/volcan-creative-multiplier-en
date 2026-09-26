"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, Loader2 } from "lucide-react";
import type { ComponentRow, ComponentKind, JobState } from "@/lib/types";
import { api, fmtDuration } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export function PreviewSection({ rows }: { rows: ComponentRow[] }) {
  const active = rows.filter((r) => r.ativo && r.existe !== false);
  const byKind = (k: ComponentKind) => active.filter((r) => r.tipo === k);

  const [hook, setHook] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [result, setResult] = useState<{ url: string; filename: string; duration: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const rendering = job ? job.phase === "previewing" || job.phase === "queued" : false;

  // default selections when rows arrive
  useEffect(() => {
    if (!hook && byKind("hook")[0]) setHook(byKind("hook")[0].id);
    if (!body && byKind("body")[0]) setBody(byKind("body")[0].id);
    if (!cta && byKind("cta")[0]) setCta(byKind("cta")[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job?.log.length]);

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.jobStatus(jobId);
        setJob(s);
        if (["done", "error", "cancelled"].includes(s.phase)) {
          if (pollRef.current) clearInterval(pollRef.current);
          if (s.phase === "done" && s.results[0]?.ok) {
            const filename = s.results[0].filename;
            setResult({
              filename,
              duration: s.results[0].durationSeg ?? 0,
              url: `/api/media?scope=preview&file=${encodeURIComponent(filename)}&t=${Date.now()}`,
            });
            toast.success(`Preview ready: ${filename}`);
          } else if (s.phase === "error") {
            toast.error(`Preview failed: ${s.message || "unknown error"}`);
          }
        }
      } catch {
        /* keep polling */
      }
    }, 500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function render() {
    if (!hook || !body || !cta) {
      toast.error("Select hook, body and cta");
      return;
    }
    setResult(null);
    setJob(null);
    try {
      const { jobId } = await api.preview({ hook, body, cta });
      setJobId(jobId);
    } catch (e: any) {
      toast.error(`Failed to start the preview: ${e.message}`);
    }
  }

  const picker = (
    label: string,
    kind: ComponentKind,
    value: string,
    onChange: (v: string) => void
  ) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`choose a ${kind}`} />
        </SelectTrigger>
        <SelectContent>
          {byKind(kind).map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.id} · {r.arquivo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>
          Renders ONE combination to check caption, overlay and transition
          before firing the whole batch.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {picker("Hook", "hook", hook, setHook)}
              {picker("Body", "body", body, setBody)}
              {picker("CTA", "cta", cta, setCta)}
            </div>
            <Button onClick={render} disabled={rendering}>
              {rendering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Rendering…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Render preview
                </>
              )}
            </Button>
            {result && (
              <div className="text-xs text-muted-foreground mono">
                {result.filename} · {fmtDuration(result.duration)}
              </div>
            )}
            {job && (rendering || job.phase === "error") && (
              <div
                ref={logRef}
                className="mono h-28 overflow-y-auto rounded-lg border border-border bg-background/60 p-2 text-[10.5px] text-muted-foreground"
              >
                {job.log.length === 0 ? (
                  <div className="opacity-60">starting…</div>
                ) : (
                  job.log.map((l, i) => <div key={i}>{l}</div>)
                )}
              </div>
            )}
          </div>

          <div className="flex justify-center">
            <div className="w-[240px] overflow-hidden rounded-xl border border-border bg-black">
              {result ? (
                <video
                  key={result.url}
                  src={result.url}
                  controls
                  autoPlay
                  className="aspect-[9/16] w-full"
                />
              ) : (
                <div className="flex aspect-[9/16] w-full items-center justify-center text-xs text-muted-foreground">
                  {rendering ? "rendering…" : "9:16 preview"}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
