import fs from "node:fs";
import path from "node:path";
import { run } from "./ffmpeg/exec";
import { probe } from "./ffmpeg/probe";
import { hashFile } from "./hash";
import { parseCsv, serializeCsv } from "./csv";
import { transcriptPath, editedTranscriptPath } from "./whisper";
import {
  kindDir,
  THUMBS_DIR,
  COMPONENTS_CSV,
  ensureDirs,
  imagesDir,
} from "./paths";
import type {
  Config,
  ComponentKind,
  ComponentRow,
  TextStyle,
  LayoutMode,
  ImageAsset,
} from "./types";

const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);

const KINDS: { kind: ComponentKind; prefix: string }[] = [
  { kind: "hook", prefix: "H" },
  { kind: "body", prefix: "B" },
  { kind: "cta", prefix: "C" },
];

/** Derive the component id from the filename prefix (H01_foo.mp4 → H01). */
function deriveId(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  // empty token (file starts with "_" or "-") → "" → flagged by the scan
  return base.split(/[_\-\s]/)[0].toUpperCase();
}

const CSV_HEADER = [
  "id",
  "tipo",
  "arquivo",
  "legenda_ativa",
  "texto_overlay",
  "texto_estilo",
  "texto_posicao",
  "layout",
  "imagem",
  "split_mudo",
  "divisao",
  "foco_video",
  "foco_imagem",
  "ativo",
  "incompativel_com",
  "punch_in",
  "variante_de",
  "origem_sugestao",
];

interface SavedEdit {
  tipo?: ComponentKind;
  arquivo?: string;
  legenda_ativa?: boolean;
  texto_overlay?: string;
  texto_estilo?: TextStyle;
  texto_posicao?: number;
  layout?: LayoutMode;
  imagem?: string;
  split_mudo?: boolean;
  divisao?: number;
  foco_video?: number;
  foco_imagem?: number;
  ativo?: boolean;
  incompativel_com?: string[];
  punch_in?: boolean;
  variante_de?: string;
  origem_sugestao?: string;
}

function parseBool(v: string | undefined): boolean | undefined {
  if (v == null || v.trim() === "") return undefined;
  return /^(true|1|yes|sim)$/i.test(v.trim());
}
function parseNum(v: string | undefined): number | undefined {
  if (v == null || v.trim() === "") return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}
function parseList(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(";").map((s) => s.trim().toUpperCase()).filter(Boolean);
}
function parseStyle(v: string | undefined): TextStyle | undefined {
  const s = (v || "").trim().toLowerCase();
  return s === "tarja" || s === "simples" ? (s as TextStyle) : undefined;
}
function parseLayout(v: string | undefined): LayoutMode | undefined {
  const s = (v || "").trim().toLowerCase();
  return s === "cheio" || s === "imagem_cima" || s === "imagem_baixo"
    ? (s as LayoutMode)
    : undefined;
}

/** Read existing components.csv into a map of user edits keyed by id. */
function readSavedEdits(): Map<string, SavedEdit> {
  const edits = new Map<string, SavedEdit>();
  if (!fs.existsSync(COMPONENTS_CSV)) return edits;
  const rows = parseCsv(fs.readFileSync(COMPONENTS_CSV, "utf8"));
  if (!rows.length) return edits;
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = r[idx("id")]?.trim();
    if (!id) continue;
    const tipoRaw = (r[idx("tipo")] ?? "").trim() as ComponentKind;
    edits.set(id, {
      tipo: tipoRaw === "hook" || tipoRaw === "body" || tipoRaw === "cta" ? tipoRaw : undefined,
      arquivo: r[idx("arquivo")] ?? "",
      legenda_ativa: parseBool(r[idx("legenda_ativa")]),
      texto_overlay: r[idx("texto_overlay")] ?? "",
      texto_estilo: parseStyle(r[idx("texto_estilo")]),
      texto_posicao: parseNum(r[idx("texto_posicao")]),
      layout: parseLayout(r[idx("layout")]),
      imagem: r[idx("imagem")] ?? "",
      split_mudo: parseBool(r[idx("split_mudo")]),
      divisao: parseNum(r[idx("divisao")]),
      foco_video: parseNum(r[idx("foco_video")]),
      foco_imagem: parseNum(r[idx("foco_imagem")]),
      ativo: parseBool(r[idx("ativo")]),
      incompativel_com: parseList(r[idx("incompativel_com")]),
      punch_in: parseBool(r[idx("punch_in")]),
      variante_de: r[idx("variante_de")]?.trim() || undefined,
      origem_sugestao: r[idx("origem_sugestao")]?.trim() || undefined,
    });
  }
  return edits;
}

/** Read a component's cached transcript text, if it exists. Never transcribes. */
function readTranscriptText(hash: string, language: string): string | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(transcriptPath(hash, language), "utf8"));
    return typeof data.text === "string" && data.text ? data.text : undefined;
  } catch {
    return undefined;
  }
}

function hasEditedTranscript(hash: string, language: string): boolean {
  return fs.existsSync(editedTranscriptPath(hash, language));
}

async function ensureThumb(
  cfg: Config,
  file: string,
  hash: string,
  duration: number
): Promise<void> {
  const thumb = path.join(THUMBS_DIR, `${hash}.jpg`);
  if (fs.existsSync(thumb)) return;
  const at = Math.min(1, Math.max(0, duration / 2));
  await run(
    cfg.bin.ffmpeg,
    [
      "-hide_banner", "-y", "-ss", at.toFixed(2), "-i", file,
      "-frames:v", "1", "-vf", "scale=180:-1", thumb,
    ],
    { allowFail: true }
  );
}

/** List split-layout media (images AND videos) available, with thumbnails. */
export async function scanImages(cfg: Config): Promise<ImageAsset[]> {
  ensureDirs(cfg);
  const dir = imagesDir(cfg);
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    files = [];
  }
  const out: ImageAsset[] = [];
  for (const f of files.sort()) {
    if (f.startsWith(".")) continue;
    const ext = path.extname(f).toLowerCase();
    const isVideo = VIDEO_EXT.has(ext);
    if (!IMAGE_EXT.has(ext) && !isVideo) continue;
    const full = path.join(dir, f);
    const hash = (await hashFile(full)).slice(0, 16);
    const info = await probe(cfg, full, hash);
    const thumb = path.join(THUMBS_DIR, `${hash}.jpg`);
    if (!fs.existsSync(thumb)) {
      // grab a frame mid-clip for videos, first frame for images
      const at = isVideo ? Math.min(1, Math.max(0, info.duration / 2)) : 0;
      await run(
        cfg.bin.ffmpeg,
        ["-hide_banner", "-y", "-ss", at.toFixed(2), "-i", full, "-frames:v", "1", "-vf", "scale=180:-1", thumb],
        { allowFail: true }
      );
    }
    out.push({
      arquivo: f,
      hash,
      width: info.width,
      height: info.height,
      tipo: isVideo ? "video" : "image",
      duracao: isVideo ? info.duration : undefined,
    });
  }
  return out;
}

/**
 * Scan /input, merge with saved edits, rewrite components.csv, and return the
 * enriched rows (duration/hash/thumb readiness) for the UI.
 */
export async function scanComponents(cfg: Config): Promise<ComponentRow[]> {
  ensureDirs(cfg);
  const saved = readSavedEdits();
  const rows: ComponentRow[] = [];
  const seen = new Map<string, string>(); // id → first filename that claimed it

  for (const { kind, prefix } of KINDS) {
    const dir = kindDir(cfg, kind);
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir);
    } catch {
      files = [];
    }
    files = files
      .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()))
      .filter((f) => !f.startsWith("."))
      .sort();

    for (const f of files) {
      const full = path.join(dir, f);
      const id = deriveId(f);
      const hash = (await hashFile(full)).slice(0, 16);
      const info = await probe(cfg, full, hash);
      await ensureThumb(cfg, full, hash, info.duration);

      // A row that cannot be used must never silently steal another's slot.
      let erro: string | undefined;
      if (!new RegExp(`^${prefix}\\d+$`).test(id)) {
        erro = `name must start with ${prefix}01_, ${prefix}02_… (found "${id}")`;
      } else if (seen.has(id)) {
        erro = `id ${id} repeated: already used by ${seen.get(id)} — rename one of them`;
      } else {
        seen.set(id, f);
      }

      const edit = saved.get(id);
      // Captions on by default for every kind (sound-off viewers decide in the
      // first 3 s); a hook that gets on-screen text automatically skips them.
      rows.push({
        erro,
        id,
        tipo: kind,
        arquivo: f,
        legenda_ativa: edit?.legenda_ativa ?? true,
        texto_overlay: edit?.texto_overlay ?? "",
        texto_estilo: edit?.texto_estilo ?? "tarja",
        texto_posicao: edit?.texto_posicao ?? cfg.tarja.posicao_vertical,
        layout: edit?.layout ?? "cheio",
        imagem: edit?.imagem ?? "",
        split_mudo: edit?.split_mudo ?? true,
        divisao: edit?.divisao ?? cfg.layout.divisao_padrao,
        foco_video: edit?.foco_video ?? cfg.layout.foco_video_padrao,
        foco_imagem: edit?.foco_imagem ?? cfg.layout.foco_imagem_padrao,
        ativo: edit?.ativo ?? true,
        incompativel_com: edit?.incompativel_com ?? [],
        punch_in: edit?.punch_in,
        origem_sugestao: edit?.origem_sugestao,
        duracao: info.duration,
        existe: true,
        hash,
        transcricao: readTranscriptText(hash, cfg.whisper.language),
        legenda_revisada: hasEditedTranscript(hash, cfg.whisper.language),
      });
    }
  }

  // Rows whose file is gone stay in the CSV (existe=false) so a clip that was
  // moved/renamed by mistake keeps its text, split and connections. They are
  // excluded from every plan; the UI flags them.
  const found = new Set(rows.map((r) => r.id));
  for (const [id, edit] of saved) {
    if (found.has(id) || edit.variante_de || !edit.tipo || !edit.arquivo) continue;
    rows.push({
      id,
      tipo: edit.tipo,
      arquivo: edit.arquivo,
      legenda_ativa: edit.legenda_ativa ?? true,
      texto_overlay: edit.texto_overlay ?? "",
      texto_estilo: edit.texto_estilo ?? "tarja",
      texto_posicao: edit.texto_posicao ?? cfg.tarja.posicao_vertical,
      layout: edit.layout ?? "cheio",
      imagem: edit.imagem ?? "",
      split_mudo: edit.split_mudo ?? true,
      divisao: edit.divisao ?? cfg.layout.divisao_padrao,
      foco_video: edit.foco_video ?? cfg.layout.foco_video_padrao,
      foco_imagem: edit.foco_imagem ?? cfg.layout.foco_imagem_padrao,
      ativo: edit.ativo ?? true,
      incompativel_com: edit.incompativel_com ?? [],
      punch_in: edit.punch_in,
      origem_sugestao: edit.origem_sugestao,
      existe: false,
      erro: `file ${edit.arquivo} is no longer in the folder`,
    });
  }

  // Virtual "text variants": extra hook rows that share another row's
  // physical file (same arquivo/hash) so one clip can run several hook texts
  // as separate, independently-trackable creatives without duplicating the
  // file. Generated from components.csv, never from the folder. If the base
  // row is missing/broken, the variant inherits that (existe:false/erro) so
  // it's excluded from plans the same way — nothing crashes, it just warns.
  for (const [id, edit] of saved) {
    if (!edit.variante_de) continue;
    const base = rows.find((r) => r.id === edit.variante_de);
    if (!base) continue; // base id renamed/removed from the CSV entirely
    rows.push({
      id,
      tipo: base.tipo,
      arquivo: base.arquivo,
      legenda_ativa: edit.legenda_ativa ?? true,
      texto_overlay: edit.texto_overlay ?? "",
      texto_estilo: edit.texto_estilo ?? "tarja",
      texto_posicao: edit.texto_posicao ?? cfg.tarja.posicao_vertical,
      layout: edit.layout ?? base.layout,
      imagem: edit.imagem ?? base.imagem,
      split_mudo: edit.split_mudo ?? base.split_mudo,
      divisao: edit.divisao ?? base.divisao,
      foco_video: edit.foco_video ?? base.foco_video,
      foco_imagem: edit.foco_imagem ?? base.foco_imagem,
      ativo: edit.ativo ?? true,
      incompativel_com: edit.incompativel_com ?? [],
      punch_in: edit.punch_in,
      variante_de: edit.variante_de,
      origem_sugestao: edit.origem_sugestao,
      duracao: base.duracao,
      existe: base.existe,
      erro: base.existe === false ? `variant of ${edit.variante_de}, which is missing its file` : undefined,
      hash: base.hash,
      transcricao: base.transcricao,
      legenda_revisada: base.legenda_revisada,
    });
  }

  writeComponentsCsv(rows);
  return rows;
}

const bool = (b: boolean) => String(b);
const numStr = (n: number | undefined, d: number) =>
  String(n ?? d);

/** Persist rows to components.csv (only the canonical columns). */
export function writeComponentsCsv(rows: ComponentRow[]): void {
  const out: string[][] = [CSV_HEADER];
  for (const r of rows) {
    out.push([
      r.id,
      r.tipo,
      r.arquivo,
      bool(r.legenda_ativa),
      r.texto_overlay ?? "",
      r.texto_estilo ?? "tarja",
      numStr(r.texto_posicao, 0.66),
      r.layout ?? "cheio",
      r.imagem ?? "",
      bool(r.split_mudo ?? true),
      numStr(r.divisao, 0.55),
      numStr(r.foco_video, 0.5),
      numStr(r.foco_imagem, 0.5),
      bool(r.ativo),
      (r.incompativel_com ?? []).join(";"),
      r.punch_in == null ? "" : bool(r.punch_in),
      r.variante_de ?? "",
      r.origem_sugestao ?? "",
    ]);
  }
  fs.writeFileSync(COMPONENTS_CSV, serializeCsv(out), "utf8");
}

/** Load components.csv WITHOUT rescanning disk (fast path for render/preview). */
export function loadComponentsCsv(): ComponentRow[] {
  if (!fs.existsSync(COMPONENTS_CSV)) return [];
  const rows = parseCsv(fs.readFileSync(COMPONENTS_CSV, "utf8"));
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (n: string) => header.indexOf(n);
  const out: ComponentRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const tipo = (r[idx("tipo")]?.trim() as ComponentKind) || "hook";
    out.push({
      id: r[idx("id")]?.trim() || "",
      tipo,
      arquivo: r[idx("arquivo")] ?? "",
      legenda_ativa: /^(true|1|yes|sim)$/i.test(r[idx("legenda_ativa")] ?? ""),
      texto_overlay: r[idx("texto_overlay")] ?? "",
      texto_estilo: parseStyle(r[idx("texto_estilo")]) ?? "tarja",
      texto_posicao: parseNum(r[idx("texto_posicao")]) ?? 0.66,
      layout: parseLayout(r[idx("layout")]) ?? "cheio",
      imagem: r[idx("imagem")] ?? "",
      split_mudo: parseBool(r[idx("split_mudo")]) ?? true,
      divisao: parseNum(r[idx("divisao")]) ?? 0.55,
      foco_video: parseNum(r[idx("foco_video")]) ?? 0.5,
      foco_imagem: parseNum(r[idx("foco_imagem")]) ?? 0.5,
      ativo: /^(true|1|yes|sim)$/i.test(r[idx("ativo")] ?? "true"),
      incompativel_com: parseList(r[idx("incompativel_com")]),
      punch_in: parseBool(r[idx("punch_in")]),
      variante_de: r[idx("variante_de")]?.trim() || undefined,
      origem_sugestao: r[idx("origem_sugestao")]?.trim() || undefined,
    });
  }
  return out;
}
