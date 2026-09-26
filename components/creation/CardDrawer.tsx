"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X, Type, ImageIcon, Copy, Loader2, Upload, Video, VolumeX, Volume2, Pencil, Trash2, Captions, RefreshCw, Zap, ListPlus } from "lucide-react";
import type { ComponentRow, ImageAsset, Config, Word } from "@/lib/types";
import { api, TEXT_STYLES, LAYOUTS } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompositionPreview } from "@/components/CompositionPreview";

export function CardDrawer({
  row,
  allRows,
  config,
  images,
  patch,
  reload,
  onClose,
}: {
  row: ComponentRow;
  allRows: ComponentRow[];
  config: Config;
  images: ImageAsset[];
  patch: (id: string, p: Partial<ComponentRow>) => void;
  reload: () => Promise<void>;
  onClose: () => void;
}) {
  const r = row;
  const hasOverlay = (r.texto_overlay ?? "").trim().length > 0;
  const split = r.layout === "imagem_cima" || r.layout === "imagem_baixo";
  const selAsset = images.find((i) => i.arquivo === r.imagem);
  const imageHash = selAsset?.hash;
  const splitIsVideo = selAsset?.tipo === "video";
  const baseId = r.variante_de || r.id;
  const variantCount = allRows.filter((x) => x.variante_de === baseId).length;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-border bg-card shadow-2xl">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-secondary text-xs font-bold text-muted-foreground">
            {r.id}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {r.arquivo.replace(/\.[^.]+$/, "")}
            </div>
            <div className="text-xs text-muted-foreground">
              {r.tipo} · edit text, split & rules
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="flex justify-center">
            <div className="w-[150px]">
              <CompositionPreview row={r} config={config} imageHash={imageHash} />
            </div>
          </div>

          {r.variante_de && (
            <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              text variant of <span className="font-semibold text-foreground">{r.variante_de}</span> — same file, own text
            </div>
          )}
          {!r.variante_de && variantCount > 0 && (
            <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              this hook has {variantCount} active text variants — the text below is not used in any render
            </div>
          )}

          {/* text */}
          <Section icon={<Type className="h-3.5 w-3.5" />} title="On-screen text">
            <Field label="Text (use | for a line break)">
              <Input
                value={r.texto_overlay ?? ""}
                placeholder="empty = use auto caption"
                onChange={(e) => patch(r.id, { texto_overlay: e.target.value })}
              />
            </Field>
            {hasOverlay ? (
              <>
                <Field label="Style">
                  <Segmented
                    value={r.texto_estilo}
                    onChange={(v) => patch(r.id, { texto_estilo: v })}
                    options={TEXT_STYLES.map((t) => ({ value: t.value, label: t.label }))}
                  />
                </Field>
                <Slider
                  label="Vertical position"
                  value={r.texto_posicao}
                  onChange={(v) => patch(r.id, { texto_posicao: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
              </>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <Label>Auto caption (karaoke)</Label>
                <Switch
                  checked={r.legenda_ativa}
                  onCheckedChange={(v) => patch(r.id, { legenda_ativa: v })}
                />
              </div>
            )}
          </Section>

          {/* caption review */}
          {!hasOverlay && <CaptionSection key={r.id} row={r} />}

          {/* layout / split */}
          <Section icon={<ImageIcon className="h-3.5 w-3.5" />} title="Framing & split">
            <Field label="Composition">
              <Segmented
                value={r.layout}
                onChange={(v) => patch(r.id, { layout: v })}
                options={LAYOUTS.map((l) => ({ value: l.value, label: l.label }))}
              />
            </Field>
            <Slider
              label="Video focus (vertical)"
              value={r.foco_video}
              onChange={(v) => patch(r.id, { foco_video: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            {split && (
              <>
                <Field label="Split media (image or video)">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Select
                        value={r.imagem || undefined}
                        onValueChange={(v) => patch(r.id, { imagem: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="choose image or video" />
                        </SelectTrigger>
                        <SelectContent>
                          {images.map((img) => (
                            <SelectItem key={img.arquivo} value={img.arquivo}>
                              <span className="inline-flex items-center gap-2">
                                {img.tipo === "video" ? (
                                  <Video className="h-3 w-3 text-sky-400" />
                                ) : (
                                  <ImageIcon className="h-3 w-3 text-muted-foreground" />
                                )}
                                {img.arquivo}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <UploadSplit
                      onDone={async (name) => {
                        patch(r.id, { imagem: name });
                        await reload();
                      }}
                    />
                  </div>
                </Field>
                {splitIsVideo && (
                  <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      {r.split_mudo !== false ? (
                        <VolumeX className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Volume2 className="h-4 w-4 text-primary" />
                      )}
                      <div>
                        <Label>Mute split video</Label>
                        <p className="text-[10.5px] text-muted-foreground">
                          recommended — avoids 2 audio tracks
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={r.split_mudo !== false}
                      onCheckedChange={(v) => patch(r.id, { split_mudo: v })}
                    />
                  </div>
                )}
                <Slider
                  label="Split (top height)"
                  value={r.divisao}
                  min={0.2}
                  max={0.8}
                  onChange={(v) => patch(r.id, { divisao: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
                <Slider
                  label="Image focus (vertical)"
                  value={r.foco_imagem}
                  onChange={(v) => patch(r.id, { foco_imagem: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
              </>
            )}
          </Section>

          {/* punch-in */}
          <Section icon={<Zap className="h-3.5 w-3.5" />} title="Punch-in (auto zoom)">
            <Segmented
              value={r.punch_in === undefined ? "inherit" : r.punch_in ? "on" : "off"}
              onChange={(v) =>
                patch(r.id, { punch_in: v === "inherit" ? undefined : v === "on" })
              }
              options={[
                { value: "inherit", label: "inherit default" },
                { value: "on", label: "on" },
                { value: "off", label: "off" },
              ]}
            />
            <p className="text-[11px] text-muted-foreground">
              subtle zoom cut at each phrase change (set the default in Configuration → Batch style)
            </p>
          </Section>

        </div>

        <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={r.ativo}
              onCheckedChange={(v) => patch(r.id, { ativo: v })}
            />
            <span className="text-xs text-muted-foreground">
              {r.ativo ? "active" : "disabled"}
            </span>
          </div>
          <div className="ml-auto flex gap-2">
            {!r.variante_de && <RenameButton id={r.id} arquivo={r.arquivo} reload={reload} />}
            <DeleteButton
              id={r.id}
              reload={reload}
              onDone={onClose}
              isVariant={!!r.variante_de}
            />
            {r.tipo === "hook" && !r.variante_de ? (
              <AddVariantButton id={r.id} reload={reload} />
            ) : !r.variante_de ? (
              <DuplicateButton id={r.id} reload={reload} />
            ) : null}
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </footer>
      </aside>
    </>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Word-by-word caption review: text is editable inline, timings never change. */
function CaptionSection({ row }: { row: ComponentRow }) {
  const [words, setWords] = useState<Word[] | null>(null);
  const [revisado, setRevisado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retranscribing, setRetranscribing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .getTranscript(row.id)
      .then(({ words, revisado }) => {
        if (!alive) return;
        setWords(words);
        setRevisado(revisado);
      })
      .catch(() => alive && setWords([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  function editWord(i: number, text: string) {
    setWords((prev) => (prev ? prev.map((w, j) => (j === i ? { ...w, text } : w)) : prev));
  }

  async function save() {
    if (!words) return;
    setSaving(true);
    try {
      await api.saveTranscript(row.id, words);
      setRevisado(true);
      toast.success("Caption saved");
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function retranscribe() {
    if (!confirm("Re-transcribe this component? Any saved edit will be lost.")) return;
    setRetranscribing(true);
    try {
      const { words } = await api.retranscribe(row.id);
      setWords(words);
      setRevisado(false);
      toast.success("Transcript redone");
    } catch (e: any) {
      toast.error(`Failed to transcribe: ${e.message}`);
    } finally {
      setRetranscribing(false);
    }
  }

  return (
    <Section icon={<Captions className="h-3.5 w-3.5" />} title="Caption">
      <div className="flex items-center justify-between">
        {!loading && !revisado && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
            caption not reviewed
          </span>
        )}
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground">loading…</div>
      ) : !words || words.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          no transcribed words yet (no speech detected, or not ingested yet).
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {words.map((w, i) => (
            <input
              key={i}
              value={w.text}
              onChange={(e) => editWord(i, e.target.value)}
              className="w-[84px] rounded-md border border-border bg-background/60 px-1.5 py-1 text-[11.5px] outline-none focus:border-primary/60"
            />
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={save}
          disabled={saving || loading || !words?.length}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Captions className="h-3.5 w-3.5" />
          )}
          save
        </Button>
        <Button variant="outline" size="sm" onClick={retranscribe} disabled={retranscribing || loading}>
          {retranscribing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          re-transcribe
        </Button>
      </div>
    </Section>
  );
}

function UploadSplit({ onDone }: { onDone: (name: string) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function handle(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const { saved } = await api.upload("image", files);
      if (saved[0]) await onDone(saved[0]);
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
      <Button
        variant="outline"
        size="icon"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        aria-label="Import image or video"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
      </Button>
    </>
  );
}

function DuplicateButton({ id, reload }: { id: string; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function dup() {
    setBusy(true);
    try {
      const { saved } = await api.duplicate(id);
      await reload();
      toast.success(`Duplicated: ${saved}`);
    } catch (e: any) {
      toast.error(`Failed to duplicate: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={dup} disabled={busy}>
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      Duplicate
    </Button>
  );
}

function AddVariantButton({ id, reload }: { id: string; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function add() {
    const texto = prompt("Text for this variant:", "");
    if (texto == null || !texto.trim()) return;
    setBusy(true);
    try {
      const { id: newId } = await api.addVariant(id, texto.trim());
      await reload();
      toast.success(`Variant created: ${newId}`);
    } catch (e: any) {
      toast.error(`Failed to create variant: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={add} disabled={busy}>
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <ListPlus className="h-3.5 w-3.5" />
      )}
      Text variant
    </Button>
  );
}

function RenameButton({
  id,
  arquivo,
  reload,
}: {
  id: string;
  arquivo: string;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function rename() {
    const current = arquivo.replace(/\.[^.]+$/, "").replace(new RegExp(`^${id}[_-]?`, "i"), "");
    const nome = prompt(`New name for ${id} (the ${id}_ prefix stays):`, current);
    if (nome == null || !nome.trim()) return;
    setBusy(true);
    try {
      const { arquivo: novo } = await api.renameComponent(id, nome.trim());
      await reload();
      toast.success(`Renamed to ${novo}`);
    } catch (e: any) {
      toast.error(`Failed to rename: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={rename} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
      Rename
    </Button>
  );
}

function DeleteButton({
  id,
  reload,
  onDone,
  isVariant,
}: {
  id: string;
  reload: () => Promise<void>;
  onDone: () => void;
  isVariant?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  async function del() {
    const msg = isVariant
      ? `Remove the text variant ${id}? The original file isn't affected.`
      : `Delete ${id}? The file goes to input/_lixeira/, it isn't deleted for good.`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await api.deleteComponent(id);
      await reload();
      toast.success(isVariant ? `${id} removed` : `${id} moved to trash`);
      onDone();
    } catch (e: any) {
      toast.error(`Failed to delete: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={del} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      Delete
    </Button>
  );
}
