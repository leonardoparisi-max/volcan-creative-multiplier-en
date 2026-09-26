"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Zap, FolderOpen, Loader2, X, Sparkles } from "lucide-react";
import type { Config, JobState } from "@/lib/types";
import { api, fmtDuration } from "@/lib/client";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";

export function RenderBar({
  count,
  config,
  onToggleUnique,
  onSetLeva,
  onRendered,
}: {
  count: number;
  config: Config;
  onToggleUnique: (v: boolean) => void;
  onSetLeva: (v: string) => void;
  onRendered: () => void;
}) {
  const [est, setEst] = useState<{ time: number; disk: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [leva, setLeva] = useState(config.render.leva_atual ?? "");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadEst() {
    try {
      const p = await api.combinations();
      setEst({ time: p.estTimeSec, disk: p.estDiskMb });
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    loadEst();
  }, [count]);

  // Re-attach to a job that is still running (page reload, server restart).
  useEffect(() => {
    api
      .latestJob()
      .then((s) => {
        if (s && ["queued", "ingesting", "rendering"].includes(s.phase)) {
          setJob(s);
          setJobId(s.id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.jobStatus(jobId);
        setJob(s);
        if (["done", "error", "cancelled"].includes(s.phase)) {
          if (pollRef.current) clearInterval(pollRef.current);
          onRendered();
          if (s.phase === "done")
            toast.success(
              `Render done: ${s.done} ready, ${s.skipped ?? 0} skipped, ${s.failed} failed`
            );
        }
      } catch {
        /* keep polling */
      }
    }, 700);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const running = job && ["queued", "ingesting", "rendering"].includes(job.phase);
  const processed = job ? job.done + job.failed + (job.skipped ?? 0) : 0;
  const pct = job && job.total ? (processed / job.total) * 100 : 0;

  // Light live filter only (letters, digits, "-"); the server fully
  // canonicalizes the slug (collapses repeats, trims edges) for the folder name.
  function changeLeva(v: string) {
    setLeva(
      v
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
    );
  }

  async function start() {
    try {
      const { jobId: id } = await api.startRender(leva);
      setJobId(id);
      setJob(null);
      toast.success("Render started");
    } catch (e: any) {
      toast.error(`Failed to start: ${e.message}`);
    }
  }
  async function cancel() {
    if (jobId) {
      await api.cancelRender(jobId);
      toast.message("Cancellation requested");
    }
  }

  return (
    <div className="sticky bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      {running && (
        <div className="px-6 pt-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {job!.phase === "ingesting" ? "preparing components…" : "rendering…"}{" "}
              {processed}/{job!.total}
              {job!.skipped ? ` (${job!.skipped} skipped)` : ""}
            </span>
            <span className="mono tabular-nums">{Math.round(pct)}%</span>
          </div>
          <Progress value={pct} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3">
        <div className="flex flex-col">
          <div className="text-[15px] font-semibold leading-none">
            <span className="text-primary tabular-nums">{count}</span> combinations
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {est
              ? `est. ~${fmtDuration(est.time)} · ~${est.disk} MB on disk`
              : "estimating…"}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>batch name</span>
          <input
            value={leva}
            onChange={(e) => changeLeva(e.target.value)}
            onBlur={() => onSetLeva(leva)}
            placeholder="optional — e.g. launch-01"
            className="w-44 rounded-md border border-border bg-background/60 px-2 py-1 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/60"
          />
        </label>

        <label
          className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
          title="every render gets fresh metadata (title/comment) so the file's bytes differ from any earlier export — keeps Meta from recognizing it as the same ad already on file. Keep this on."
        >
          <Switch
            checked={config.render.arquivos_unicos === true}
            onCheckedChange={onToggleUnique}
          />
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          unique metadata
          <span className="text-muted-foreground/60">(anti-Meta)</span>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => api.reveal(job?.batchId)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-[13px] font-medium transition hover:border-muted-foreground/50"
          >
            <FolderOpen className="h-4 w-4 text-muted-foreground" /> Open folder
          </button>
          {running ? (
            <button
              onClick={cancel}
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-[13px] font-semibold text-destructive-foreground"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          ) : (
            <button
              onClick={start}
              disabled={count === 0}
              className="cc-grad inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-primary/30 transition hover:brightness-110 disabled:opacity-40"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Render
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
