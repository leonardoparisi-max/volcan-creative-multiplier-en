import type {
  Config,
  ComponentRow,
  DoctorReport,
  JobState,
  TransitionType,
  EdgeEffect,
  ImageAsset,
  TextStyle,
  LayoutMode,
  ComponentKind,
  Connections,
  Word,
} from "./types";
import type { ResultsConfig, ColumnMapping, RankingResult, LearningsFile } from "./results/types";

async function j<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  doctor: () => fetch("/api/doctor").then((r) => j<DoctorReport>(r)),
  getConfig: () => fetch("/api/config").then((r) => j<Config>(r)),
  saveConfig: (cfg: Config) =>
    fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    }).then((r) => j<Config>(r)),
  scan: () => fetch("/api/scan", { method: "POST" }).then((r) => j<{ rows: ComponentRow[] }>(r)),
  getComponents: () => fetch("/api/components").then((r) => j<{ rows: ComponentRow[] }>(r)),
  getImages: () => fetch("/api/images").then((r) => j<{ images: ImageAsset[] }>(r)),
  saveComponents: (rows: ComponentRow[]) =>
    fetch("/api/components", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    }).then((r) => j<{ ok: boolean }>(r)),
  combinations: () =>
    fetch("/api/combinations", { method: "POST" }).then((r) =>
      j<CombinationsResponse>(r)
    ),
  preview: (ids: { hook: string; body: string; cta: string }) =>
    fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids),
    }).then((r) => j<{ jobId: string }>(r)),
  startRender: (leva?: string) =>
    fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leva }),
    }).then((r) => j<{ jobId: string; total: number }>(r)),
  jobStatus: (id: string) =>
    fetch(`/api/render?id=${id}`).then((r) => j<JobState>(r)),
  /** Most recent job (running or finished) — null when there is none. */
  latestJob: () =>
    fetch("/api/render").then((r) => (r.ok ? (r.json() as Promise<JobState>) : null)),
  cancelRender: (id: string) =>
    fetch(`/api/render?id=${id}`, { method: "DELETE" }).then((r) =>
      j<{ ok: boolean }>(r)
    ),
  reveal: (batch?: string, file?: string) =>
    fetch("/api/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch, file }),
    }).then((r) => j<{ ok: boolean; path: string }>(r)),
  batches: () => fetch("/api/batches").then((r) => j<{ batches: BatchInfo[] }>(r)),
  deleteBatch: (name: string) =>
    fetch(`/api/batches?name=${encodeURIComponent(name)}`, { method: "DELETE" }).then((r) =>
      j<{ ok: boolean }>(r)
    ),
  outFiles: (batch: string) =>
    fetch(`/api/manifest?batch=${encodeURIComponent(batch)}`).then((r) =>
      j<{ arquivos: OutFile[] }>(r)
    ),
  getConnections: () => fetch("/api/connections").then((r) => j<Connections>(r)),
  saveConnections: (c: Connections) =>
    fetch("/api/connections", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    }).then((r) => j<{ ok: boolean }>(r)),
  upload: (kind: ComponentKind | "image", files: FileList | File[]) => {
    const fd = new FormData();
    fd.append("kind", kind);
    for (const f of Array.from(files)) fd.append("files", f);
    return fetch("/api/upload", { method: "POST", body: fd }).then((r) =>
      j<{ saved: string[]; skipped: string[] }>(r)
    );
  },
  duplicate: (id: string) =>
    fetch("/api/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).then((r) => j<{ saved: string }>(r)),
  renameComponent: (id: string, nome: string) =>
    fetch(`/api/components/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    }).then((r) => j<{ ok: boolean; arquivo: string }>(r)),
  deleteComponent: (id: string) =>
    fetch(`/api/components/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) =>
      j<{ ok: boolean }>(r)
    ),
  addVariant: (id: string, texto?: string) =>
    fetch(`/api/components/${encodeURIComponent(id)}/variant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    }).then((r) => j<{ ok: boolean; id: string }>(r)),
  getTranscript: (id: string) =>
    fetch(`/api/transcribe?id=${encodeURIComponent(id)}`).then((r) =>
      j<{ words: Word[]; revisado: boolean }>(r)
    ),
  saveTranscript: (id: string, words: Word[]) =>
    fetch("/api/transcribe", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, words }),
    }).then((r) => j<{ ok: boolean }>(r)),
  retranscribe: (id: string) =>
    fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).then((r) => j<{ words: Word[] }>(r)),
  clean: (target: "cache" | "output" | "all") =>
    fetch("/api/clean", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    }).then((r) => j<{ freedMb: number }>(r)),
  listPresets: () =>
    fetch("/api/presets").then((r) => j<{ presets: string[] }>(r)),
  savePreset: (name: string, config: Config) =>
    fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, config }),
    }).then((r) => j<{ ok: boolean }>(r)),
  loadPreset: (name: string) =>
    fetch(`/api/presets?name=${encodeURIComponent(name)}`).then((r) =>
      j<{ config: Config }>(r)
    ),
  getResultsConfig: () => fetch("/api/results/config").then((r) => j<ResultsConfig>(r)),
  saveResultsConfig: (cfg: ResultsConfig) =>
    fetch("/api/results/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    }).then((r) => j<ResultsConfig>(r)),
  inspectResultsCsv: (csvText: string) =>
    fetch("/api/results/import/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvText }),
    }).then((r) => j<{ headers: string[]; sampleRows: string[][]; totalRows: number; mapping: Partial<ColumnMapping> }>(r)),
  importResultsCsv: (csvText: string, mapping: ColumnMapping, arquivo: string) =>
    fetch("/api/results/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvText, mapping, arquivo }),
    }).then((r) => j<{ ok: boolean; total: number; reconhecidas: number; naoReconhecidas: number }>(r)),
  listResultsImports: () =>
    fetch("/api/results/imports").then((r) =>
      j<{ imports: { data: string; arquivo: string; total: number; reconhecidas: number; naoReconhecidas: number }[] }>(r)
    ),
  getRanking: () => fetch("/api/results/ranking").then((r) => j<RankingResult>(r)),
  generatePrompt: () =>
    fetch("/api/results/prompt", { method: "POST" }).then((r) => j<{ run: number; prompt: string; data: any; path: string }>(r)),
  getLearnings: () => fetch("/api/results/learnings").then((r) => j<LearningsFile>(r)),
  parseAiResponse: (raw: string) =>
    fetch("/api/results/learnings/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    }).then((r) => j<{ valid: boolean; errors: string[]; diff?: any }>(r)),
  importAiResponse: (raw: string) =>
    fetch("/api/results/learnings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    }).then((r) => j<LearningsFile>(r)),
};

export interface BatchInfo {
  name: string;
  leva: string;
  count: number;
  sizeMb: number;
  hasManifest: boolean;
  ok: number;
  erro: number;
  pulado: number;
  mtime: number;
}

/** One manifest row (the columns jobs.ts writes to manifest.csv/.json). */
export interface OutFile {
  arquivo: string;
  versao_id: string;
  hook_id: string;
  body_id: string;
  cta_id: string;
  hook_arquivo: string;
  body_arquivo: string;
  cta_arquivo: string;
  hook_texto: string;
  body_texto: string;
  cta_texto: string;
  hook_modo: string;
  hook_layout: string;
  hook_variante_de: string;
  transicao: string;
  duracao_seg: string;
  tamanho_mb: string;
  status: "ok" | "erro" | "pulado" | string;
  erro: string;
  gerado_em: string;
}

export interface CombinationsResponse {
  combinations: { filename: string; hook: string; body: string; cta: string }[];
  count: number;
  hooks: number;
  bodies: number;
  ctas: number;
  skippedIncompatible: number;
  avgDurationSec: number;
  estDiskMb: number;
  estTimeSec: number;
}

export const TRANSITIONS: { value: TransitionType; label: string; desc: string }[] =
  [
    { value: "cut", label: "cut", desc: "Hard cut — direct concat, no xfade" },
    { value: "fade", label: "fade", desc: "Cross dissolve (default)" },
    { value: "fadeblack", label: "fadeblack", desc: "Through black" },
    { value: "fadewhite", label: "fadewhite", desc: "Through white" },
    { value: "dissolve", label: "dissolve", desc: "Grainy dissolve" },
    { value: "slideleft", label: "slideleft", desc: "Slide left" },
    { value: "slideright", label: "slideright", desc: "Slide right" },
    { value: "slideup", label: "slideup", desc: "Slide up" },
    { value: "wipeleft", label: "wipeleft", desc: "Horizontal wipe" },
    { value: "wipeup", label: "wipeup", desc: "Vertical wipe" },
    { value: "circleopen", label: "circleopen", desc: "Circle open" },
    { value: "circleclose", label: "circleclose", desc: "Circle close" },
    { value: "zoomin", label: "zoomin", desc: "Zoom" },
    { value: "pixelize", label: "pixelize", desc: "Pixelize" },
    { value: "smoothleft", label: "smoothleft", desc: "Smooth wipe" },
  ];

export const EDGE_EFFECTS: { value: EdgeEffect; label: string }[] = [
  { value: "none", label: "none" },
  { value: "fadeblack", label: "fadeblack" },
  { value: "fadewhite", label: "fadewhite" },
];

export const TEXT_STYLES: { value: TextStyle; label: string; desc: string }[] = [
  { value: "tarja", label: "Bar", desc: "Orange bar behind the text (default)" },
  { value: "simples", label: "Plain", desc: "Text straight on screen, no bar" },
];

export const LAYOUTS: { value: LayoutMode; label: string; desc: string }[] = [
  { value: "cheio", label: "Full video", desc: "Video fills the whole screen" },
  { value: "imagem_cima", label: "Media on top", desc: "Media on top, video below" },
  { value: "imagem_baixo", label: "Media on bottom", desc: "Video on top, media below" },
];

export function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
