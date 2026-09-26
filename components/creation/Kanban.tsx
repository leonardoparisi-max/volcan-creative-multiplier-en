"use client";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Film,
  Type,
  Captions,
  SquareSplitVertical,
  ImagePlus,
  Pencil,
} from "lucide-react";
import type { ComponentRow, ComponentKind, ImageAsset, Config } from "@/lib/types";
import { api, fmtDuration } from "@/lib/client";
import { Switch } from "@/components/ui/switch";
import { CardDrawer } from "@/components/creation/CardDrawer";

const COLS: { kind: ComponentKind; label: string; n: number; color: string }[] = [
  { kind: "hook", label: "Hook", n: 1, color: "text-primary" },
  { kind: "body", label: "Body", n: 2, color: "text-sky-400" },
  { kind: "cta", label: "CTA", n: 3, color: "text-emerald-400" },
];

const BADGE_BG: Record<ComponentKind, string> = {
  hook: "bg-primary",
  body: "bg-sky-400",
  cta: "bg-emerald-400",
};

/** First line of what the component says on screen or out loud — overlay text wins, else the transcript. */
export function previewText(r: {
  texto_overlay?: string;
  transcricao?: string;
}): string {
  const overlay = (r.texto_overlay ?? "").trim();
  if (overlay) return overlay.split("|")[0].trim();
  return (r.transcricao ?? "").trim();
}

export function Kanban({
  rows,
  setRows,
  images,
  config,
  reload,
  onlyActive,
}: {
  rows: ComponentRow[];
  setRows: (r: ComponentRow[]) => void;
  images: ImageAsset[];
  config: Config;
  reload: () => Promise<void>;
  onlyActive: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ComponentKind | null>(null);

  async function dropFiles(kind: ComponentKind, files: FileList | null) {
    setDragOver(null);
    if (!files || !files.length) return;
    try {
      const { saved, skipped } = await api.upload(kind, files);
      await reload();
      toast.success(
        `${saved.length} added` + (skipped.length ? ` · ${skipped.length} skipped` : "")
      );
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    }
  }

  function patch(id: string, p: Partial<ComponentRow>) {
    const next = rows.map((r) => (r.id === id ? { ...r, ...p } : r));
    setRows(next);
    // persist quietly so edits survive a rescan
    api.saveComponents(next).catch(() => {});
  }

  // Group each hook's text variants right next to their base row (base id is
  // always a prefix of its variants' ids, e.g. H01 < H01a < H01b < H02…).
  const byGroup = (a: ComponentRow, b: ComponentRow) =>
    (a.variante_de || a.id).localeCompare(b.variante_de || b.id) || a.id.localeCompare(b.id);

  const grouped = useMemo(
    () => ({
      hook: rows.filter((r) => r.tipo === "hook").sort(byGroup),
      body: rows.filter((r) => r.tipo === "body"),
      cta: rows.filter((r) => r.tipo === "cta"),
    }),
    [rows]
  );

  const editRow = rows.find((r) => r.id === editing) || null;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {COLS.map((c) => {
          const list = grouped[c.kind].filter((r) => (onlyActive ? r.ativo : true));
          return (
            <div
              key={c.kind}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(c.kind);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropFiles(c.kind, e.dataTransfer.files);
              }}
              className={`flex flex-col gap-2.5 rounded-xl border p-3 transition ${
                dragOver === c.kind
                  ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                  : "border-border bg-background/40"
              }`}
            >
              <div className="flex items-center gap-2 px-0.5">
                <span
                  className={`grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold text-black ${BADGE_BG[c.kind]}`}
                >
                  {c.n}
                </span>
                <span className="text-sm font-semibold">{c.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {list.length}
                </span>
                <div className="ml-auto">
                  <AddClips kind={c.kind} onDone={reload} />
                </div>
              </div>

              {list.map((r) => (
                <KanbanCard
                  key={r.id}
                  r={r}
                  onEdit={() => setEditing(r.id)}
                  onToggle={(v) => patch(r.id, { ativo: v })}
                  onAddMedia={reload}
                  patch={patch}
                />
              ))}

              <UploadDrop kind={c.kind} onDone={reload} />
            </div>
          );
        })}
      </div>

      {editRow && (
        <CardDrawer
          row={editRow}
          allRows={rows}
          config={config}
          images={images}
          patch={patch}
          reload={reload}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function KanbanCard({
  r,
  onEdit,
  onToggle,
  onAddMedia,
  patch,
}: {
  r: ComponentRow;
  onEdit: () => void;
  onToggle: (v: boolean) => void;
  onAddMedia: () => Promise<void>;
  patch: (id: string, p: Partial<ComponentRow>) => void;
}) {
  const hasOverlay = (r.texto_overlay ?? "").trim().length > 0;
  const wantsSplit = r.layout === "imagem_cima" || r.layout === "imagem_baixo";
  const split = wantsSplit && !!r.imagem;
  const splitSemMidia = wantsSplit && !r.imagem;

  return (
    <div
      onClick={onEdit}
      className={`group relative flex cursor-pointer gap-3 rounded-xl border p-2.5 transition ${
        r.ativo
          ? "border-border bg-secondary/40 hover:border-muted-foreground/40 hover:bg-secondary"
          : "border-border/60 bg-background/30 opacity-55 hover:opacity-80"
      }`}
    >
      {/* thumb */}
      <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md bg-black">
        {r.hash ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/thumb?hash=${r.hash}`}
            alt={r.id}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <Film className="h-3.5 w-3.5 opacity-40" />
          </div>
        )}
        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] tabular-nums text-white/90">
          {fmtDuration(r.duracao ?? 0)}
        </span>
        {split && (
          <span className="absolute inset-x-0 bottom-0 h-2/5 border-t-2 border-primary bg-gradient-to-b from-sky-500/40 to-sky-800/40" />
        )}
      </div>

      {/* body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="truncate text-[13px] font-medium leading-tight">
          <span className="mr-1.5 text-[11px] font-bold text-muted-foreground">
            {r.id}
          </span>
          {r.variante_de ? `variant of ${r.variante_de}` : r.arquivo.replace(/\.[^.]+$/, "")}
        </div>
        {previewText(r) && (
          <div className="truncate text-[11px] text-muted-foreground/70">
            {previewText(r)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {r.existe === false && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] text-amber-300">
              file missing
            </span>
          )}
          {r.erro && r.existe !== false && (
            <span
              title={r.erro}
              className="inline-flex items-center gap-1 rounded-md border border-red-500/50 bg-red-500/10 px-1.5 py-0.5 text-[10.5px] text-red-300"
            >
              ⚠ {r.erro}
            </span>
          )}
          {splitSemMidia && (
            <span
              title="composition wants split media, but none was chosen — the render uses the full video"
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] text-amber-300"
            >
              split has no media
            </span>
          )}
          {hasOverlay ? (
            <Chip on icon={<Type className="h-3 w-3" />}>
              {r.texto_estilo === "tarja" ? "bar" : "text"}
            </Chip>
          ) : r.legenda_ativa ? (
            <Chip on icon={<Captions className="h-3 w-3" />}>caption</Chip>
          ) : (
            <Chip icon={<Type className="h-3 w-3" />}>no text</Chip>
          )}
          {!hasOverlay && r.legenda_ativa && !r.legenda_revisada && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
              caption not reviewed
            </span>
          )}
          {split ? (
            <Chip split icon={<SquareSplitVertical className="h-3 w-3" />}>
              split
            </Chip>
          ) : (
            <AddMediaChip r={r} onDone={onAddMedia} patch={patch} />
          )}
        </div>
      </div>

      {/* controls */}
      <div
        className="flex shrink-0 flex-col items-end justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onEdit}
          className="grid h-6 w-6 place-items-center rounded text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
          aria-label="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <Switch checked={r.ativo} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}

function Chip({
  children,
  icon,
  on,
  split,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  on?: boolean;
  split?: boolean;
}) {
  const cls = split
    ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
    : on
    ? "border-primary/40 bg-primary/10 text-primary"
    : "border-border bg-secondary/60 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] ${cls}`}
    >
      {icon}
      {children}
    </span>
  );
}

/** Per-card media upload → sets it as the split asset for this component. */
function AddMediaChip({
  r,
  onDone,
  patch,
}: {
  r: ComponentRow;
  onDone: () => Promise<void>;
  patch: (id: string, p: Partial<ComponentRow>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const { saved } = await api.upload("image", files);
      if (saved[0]) {
        patch(r.id, { imagem: saved[0], layout: "imagem_baixo", split_mudo: true });
        toast.success(`Split added to ${r.id}`);
      }
      await onDone();
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition hover:border-muted-foreground/60 hover:text-foreground"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ImagePlus className="h-3 w-3" />
        )}
        image/video
      </button>
    </>
  );
}

/** Column header uploader (adds new clips to this kind). */
function AddClips({
  kind,
  onDone,
}: {
  kind: ComponentKind;
  onDone: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const { saved, skipped } = await api.upload(kind, files);
      await onDone();
      toast.success(
        `${saved.length} added` +
          (skipped.length ? ` · ${skipped.length} skipped` : "")
      );
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:border-primary hover:bg-primary/5"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Add
      </button>
    </>
  );
}

/** Big dashed drop target at the bottom of each column. */
function UploadDrop({
  kind,
  onDone,
}: {
  kind: ComponentKind;
  onDone: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const { saved } = await api.upload(kind, files);
      await onDone();
      toast.success(`${saved.length} added`);
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*"
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        import video or image
      </button>
    </>
  );
}
