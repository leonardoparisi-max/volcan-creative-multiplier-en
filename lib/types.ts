// ---------------------------------------------------------------------------
// Shared domain types for Creative Multiplier.
// ---------------------------------------------------------------------------

export type ComponentKind = "hook" | "body" | "cta";

/** Transition names exposed in the UI, mapped to xfade internally. */
export type TransitionType =
  | "cut"
  | "fade"
  | "fadeblack"
  | "fadewhite"
  | "dissolve"
  | "slideleft"
  | "slideright"
  | "slideup"
  | "wipeleft"
  | "wipeup"
  | "circleopen"
  | "circleclose"
  | "zoomin"
  | "pixelize"
  | "smoothleft";

export type EdgeEffect = "none" | "fadeblack" | "fadewhite";

/** How the on-screen text of a component is rendered. */
export type TextStyle = "tarja" | "simples";

/** Frame composition of a component. */
export type LayoutMode = "cheio" | "imagem_cima" | "imagem_baixo";

export interface Config {
  input_dir: string;
  output_dir: string;
  bin: {
    ffmpeg: string;
    ffprobe: string;
    whisper: string;
  };
  whisper: {
    model_path: string;
    language: string;
    threads: number;
  };
  video: {
    width: number;
    height: number;
    fps: number;
    encoder: "h264_videotoolbox" | "libx264";
    bitrate_final: string;
    crf_master: number;
  };
  audio: {
    loudnorm_target_i: number;
    loudnorm_target_tp: number;
    loudnorm_target_lra: number;
    denoise: boolean;
    denoise_strength: number;
  };
  trim: {
    auto_trim_silence: boolean;
    silence_threshold_db: number;
    silence_min_duration: number;
    padding_start: number;
    padding_end: number;
  };
  transicao: {
    tipo: TransitionType;
    duracao: number;
    abertura: EdgeEffect;
    abertura_duracao: number;
    fechamento: EdgeEffect;
    fechamento_duracao: number;
  };
  legenda: {
    fonte: string;
    tamanho: number;
    cor: string;
    cor_destaque: string;
    contorno_cor: string;
    contorno_largura: number;
    sombra: number;
    posicao_vertical: number;
    max_palavras_linha: number;
    modo: "karaoke_palavra";
  };
  overlay_hook: {
    fonte: string;
    tamanho: number;
    cor: string;
    contorno_cor: string;
    contorno_largura: number;
    posicao_vertical: number;
    alinhamento: "left" | "center" | "right";
    fundo_caixa: boolean;
    fundo_cor: string;
    animacao_entrada: "none" | "fade";
  };
  /** Full-bleed gradient banner behind the text (the brand "tarja"). */
  tarja: {
    cor_inicio: string;
    cor_fim: string;
    fonte: string;
    tamanho: number;
    cor_texto: string;
    padding_vertical: number;
    espaco_linha: number;
    largura: number; // 1 = full bleed
    sombra_offset: number;
    sombra_cor: string;
    contorno_largura: number;
    contorno_cor: string;
    posicao_vertical: number; // used when layout = cheio
  };
  /** Defaults for split (video + image) compositions. */
  layout: {
    divisao_padrao: number; // fraction of height for the TOP region
    foco_video_padrao: number;
    foco_imagem_padrao: number;
  };
  edicao: {
    /** Alternating zoom-in cut on the component's own footage — a cheap "punch" cut, not an animated Ken Burns. */
    punch_in: {
      ativo: boolean;
      zoom: number; // e.g. 1.08 = 8% tighter crop
      a_cada: "frase" | "segundos";
      segundos: number; // interval used in "segundos" mode, and as the fallback when "frase" has no punctuation to key off
    };
  };
  render: {
    concorrencia: number;
    sobrescrever_existentes: boolean;
    /** Output filename pattern. Tokens: {hook} {body} {cta} {n} {prefixo} */
    padrao_nome: string;
    /** Optional prefix prepended to every output file of a batch. */
    prefixo: string;
    /**
     * When true (default), every exported file gets a fresh title/comment
     * tag, so its bytes — and therefore its file hash — differ from any
     * earlier export of the same combination. Without this, re-rendering the
     * same creative into a new leva can produce a byte-identical file, and ad
     * platforms that dedupe uploads by file hash (Meta does) will treat it as
     * the same asset already in the account instead of a fresh upload — which
     * defeats testing it as a separate ad. Metadata-only, no re-encode, no
     * effect on the filename (that's versao_id, always on).
     */
    arquivos_unicos?: boolean;
    /** Last "leva" (named batch) used in the RenderBar, remembered across reloads. */
    leva_atual?: string;
  };
}

/** One row of components.csv, enriched with runtime-only fields (duration, thumb). */
export interface ComponentRow {
  id: string; // H01, B02, C01
  tipo: ComponentKind;
  arquivo: string; // basename with extension
  legenda_ativa: boolean;
  texto_overlay: string; // "" = none; "|" = line break
  texto_estilo: TextStyle; // tarja (gradient bar) or simples (plain drawtext)
  texto_posicao: number; // 0-1 vertical centre of the bar/overlay
  layout: LayoutMode;
  imagem: string; // split-media filename in input/imagens — image OR video
  split_mudo?: boolean; // when the split media is a video: mute it (default true)
  divisao: number; // 0-1 fraction of height for the TOP region
  foco_video: number; // 0-1 vertical crop anchor
  foco_imagem: number; // 0-1 vertical crop anchor
  ativo: boolean;
  incompativel_com: string[]; // list of ids
  /** undefined = inherits the global default (edicao.punch_in.ativo); true/false forces it on/off for this component. */
  punch_in?: boolean;
  /**
   * Marks this row as a virtual text variant of the base hook (e.g. H01a
   * points variante_de="H01"). Has no file of its own — inherits
   * arquivo/hash/duration from the base row on every scan. Hooks only.
   */
  variante_de?: string;
  /** Id of a Suggestion (results/learnings.json) this component tests — closes the suggestion→production→outcome loop. */
  origem_sugestao?: string;
  // ---- runtime-only (not persisted to csv) ----
  duracao?: number; // seconds, from ffprobe
  existe?: boolean; // file still present on disk
  hash?: string; // sha256 of source file (short)
  /** Set by the scan when the row cannot be used (duplicate/invalid id). Blocks render. */
  erro?: string;
  /** Full transcript text, read (not generated) from .cache/transcripts/ when it exists. */
  transcricao?: string;
  /** True once a .edited.json caption revision has been saved for this component. */
  legenda_revisada?: boolean;
}

/** A media asset available for split layouts — an image OR a video. */
export interface ImageAsset {
  arquivo: string;
  hash: string;
  width: number;
  height: number;
  tipo: "image" | "video";
  duracao?: number; // seconds, when tipo === "video"
}

/**
 * The connection graph (funnel). Edges are ON by default — we store only the
 * CUTS, so a newly added component is automatically connected to everything.
 * A creative is valid when the hook→body edge AND the body→cta edge both exist
 * (i.e. neither pair is cut) and all three components are active.
 * Cut keys are "A|B" strings.
 */
export interface Connections {
  cutsHookBody: string[];
  cutsBodyCta: string[];
}

export interface Combination {
  filename: string; // H01_B01_C01.mp4
  hook: string;
  body: string;
  cta: string;
  /** Deterministic content id (hash of the 3 master keys + transition + video config), set by the job. */
  versao_id?: string;
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

/** Whisper per-word timing. */
export interface Word {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

export type JobPhase =
  | "queued"
  | "ingesting"
  | "rendering"
  | "previewing"
  | "done"
  | "error"
  | "cancelled";

export interface RenderItemResult {
  filename: string;
  ok: boolean;
  error?: string;
  durationSeg?: number;
  sizeMb?: number;
  ms?: number; // wall time
}

export interface JobState {
  id: string;
  phase: JobPhase;
  total: number;
  done: number;
  failed: number;
  /** Already up to date on disk (same versao_id) — skipped without re-encoding. */
  skipped: number;
  current: string[]; // filenames in flight
  log: string[];
  results: RenderItemResult[];
  startedAt: number;
  /** Last progress/log update — lets a reloaded server tell a live job from a dead one. */
  touchedAt?: number;
  finishedAt?: number;
  batchId?: string;
  message?: string;
}
