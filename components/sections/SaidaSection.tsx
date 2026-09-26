"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  FolderOpen,
  RefreshCw,
  FileVideo,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Trash2,
  Play,
  X,
} from "lucide-react";
import { api, fmtDuration, type BatchInfo, type OutFile } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export function SaidaSection({ refreshKey }: { refreshKey: number }) {
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, OutFile[]>>({});
  const [loadingFiles, setLoadingFiles] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ batch: string; file: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { batches } = await api.batches();
      setBatches(batches);
    } catch (e: any) {
      toast.error(`Failed to list: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function toggle(name: string) {
    if (open === name) {
      setOpen(null);
      return;
    }
    setOpen(name);
    if (!files[name]) {
      setLoadingFiles(name);
      try {
        const { arquivos } = await api.outFiles(name);
        setFiles((f) => ({ ...f, [name]: arquivos }));
      } catch (e: any) {
        toast.error(`Failed to read manifest: ${e.message}`);
      } finally {
        setLoadingFiles(null);
      }
    }
  }

  async function del(name: string) {
    if (!confirm(`Delete the batch "${name}" and every video inside it? This can't be undone.`)) {
      return;
    }
    try {
      await api.deleteBatch(name);
      toast.success(`Batch "${name}" deleted`);
      if (open === name) setOpen(null);
      setFiles((f) => {
        const { [name]: _drop, ...rest } = f;
        return rest;
      });
      load();
    } catch (e: any) {
      toast.error(`Failed to delete: ${e.message}`);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Output</CardTitle>
          <CardDescription>
            Rendered batches, ready to upload to your ad platform
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => api.reveal()}>
            <FolderOpen className="h-3.5 w-3.5" /> Open folder
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {batches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No batches yet. Run a render in the previous step.
          </div>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => (
              <div
                key={b.name}
                className="rounded-lg border border-border bg-background/40"
              >
                <div
                  className="flex cursor-pointer items-center gap-3 px-3 py-2.5"
                  onClick={() => toggle(b.name)}
                >
                  <span className="text-muted-foreground">
                    {open === b.name ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <FileVideo className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium mono">{b.leva}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{b.count} videos</span>
                      <span>·</span>
                      <span className="tabular-nums">{b.sizeMb} MB</span>
                      {b.ok > 0 && (
                        <Badge variant="success" className="ml-1">
                          {b.ok} ok
                        </Badge>
                      )}
                      {b.pulado > 0 && <Badge variant="secondary">{b.pulado} skipped</Badge>}
                      {b.erro > 0 && <Badge variant="danger">{b.erro} errors</Badge>}
                      {b.hasManifest && (
                        <Badge variant="success" className="ml-1">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> manifest
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => api.reveal(b.name)}>
                      <FolderOpen className="h-3.5 w-3.5" /> Finder
                    </Button>
                    {b.hasManifest && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => api.reveal(b.name, "manifest.csv")}
                      >
                        <FileText className="h-3.5 w-3.5" /> manifest
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => del(b.name)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {open === b.name && (
                  <div className="border-t border-border p-3">
                    {loadingFiles === b.name ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        loading…
                      </div>
                    ) : (files[b.name] ?? []).length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        no manifest for this batch
                      </div>
                    ) : (
                      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {(files[b.name] ?? []).map((f) => (
                          <button
                            key={f.arquivo}
                            onClick={() => setPlaying({ batch: b.name, file: f.arquivo })}
                            className="group flex items-start gap-2.5 rounded-lg border border-border bg-secondary/30 p-2 text-left transition hover:border-primary/40"
                          >
                            <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-black">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/thumb?batch=${encodeURIComponent(b.name)}&file=${encodeURIComponent(f.arquivo)}`}
                                alt={f.arquivo}
                                className="h-full w-full object-cover"
                              />
                              <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                                <Play className="h-4 w-4 text-white" />
                              </span>
                              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] tabular-nums text-white/90">
                                {fmtDuration(parseFloat(f.duracao_seg) || 0)}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[11.5px] font-medium mono">
                                {f.hook_id}_{f.body_id}_{f.cta_id}
                              </div>
                              <div className="truncate text-[10.5px] text-muted-foreground">
                                {f.hook_texto || "—"}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                                <span className="tabular-nums">{f.tamanho_mb} MB</span>
                                {f.status !== "ok" && (
                                  <Badge
                                    variant={f.status === "erro" ? "danger" : "secondary"}
                                    className="px-1 py-0 text-[9px]"
                                  >
                                    {f.status === "erro" ? "error" : f.status === "pulado" ? "skipped" : f.status}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {playing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPlaying(null)}
        >
          <button
            onClick={() => setPlaying(null)}
            className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <video
            key={`${playing.batch}/${playing.file}`}
            src={`/api/media?scope=batch&batch=${encodeURIComponent(playing.batch)}&file=${encodeURIComponent(playing.file)}`}
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
            className="aspect-[9/16] max-h-[85vh] rounded-xl border border-border bg-black"
          />
        </div>
      )}
    </Card>
  );
}
