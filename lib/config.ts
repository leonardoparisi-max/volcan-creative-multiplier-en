import fs from "node:fs";
import type { Config } from "./types";
import { CONFIG_JSON } from "./paths";

/** Deep-merge loaded config over defaults so partial/older configs still work. */
function deepMerge<T>(base: T, over: any): T {
  if (over === null || over === undefined) return base;
  if (Array.isArray(base) || typeof base !== "object") return over as T;
  const out: any = { ...base };
  for (const k of Object.keys(over)) {
    const b = (base as any)[k];
    if (b && typeof b === "object" && !Array.isArray(b)) {
      out[k] = deepMerge(b, over[k]);
    } else {
      out[k] = over[k];
    }
  }
  return out;
}

export const DEFAULT_CONFIG: Config = {
  input_dir: "./input",
  output_dir: "./output",
  bin: {
    ffmpeg: "/opt/homebrew/bin/ffmpeg",
    ffprobe: "/opt/homebrew/bin/ffprobe",
    whisper: "/opt/homebrew/bin/whisper-cli",
  },
  whisper: {
    model_path: "./models/ggml-large-v3-turbo.bin",
    language: "pt",
    threads: 8,
  },
  video: {
    width: 1080,
    height: 1920,
    fps: 30,
    encoder: "h264_videotoolbox",
    bitrate_final: "10M",
    crf_master: 16,
  },
  audio: {
    loudnorm_target_i: -14,
    loudnorm_target_tp: -1.5,
    loudnorm_target_lra: 11,
    denoise: true,
    denoise_strength: 0.12,
  },
  trim: {
    auto_trim_silence: true,
    silence_threshold_db: -35,
    silence_min_duration: 0.25,
    padding_start: 0.05,
    padding_end: 0.1,
  },
  transicao: {
    tipo: "fade",
    duracao: 0.2,
    abertura: "none",
    abertura_duracao: 0.3,
    fechamento: "fadeblack",
    fechamento_duracao: 0.4,
  },
  // Ad-caption defaults: big, 3 words per line, placed above the platform UI
  // (60 % of the height) and inside the side safe margins (see ass.ts SAFE_ZONE).
  legenda: {
    fonte: "Montserrat ExtraBold",
    tamanho: 96,
    cor: "#FFFFFF",
    cor_destaque: "#FC7A12",
    contorno_cor: "#000000",
    contorno_largura: 6,
    sombra: 2,
    posicao_vertical: 0.6,
    max_palavras_linha: 3,
    modo: "karaoke_palavra",
  },
  overlay_hook: {
    fonte: "Montserrat ExtraBold",
    tamanho: 84,
    cor: "#FFFFFF",
    contorno_cor: "#000000",
    contorno_largura: 5,
    posicao_vertical: 0.3,
    alinhamento: "center",
    fundo_caixa: false,
    fundo_cor: "#000000AA",
    animacao_entrada: "none",
  },
  tarja: {
    cor_inicio: "#D9443C",
    cor_fim: "#F08B33",
    fonte: "Montserrat ExtraBold",
    tamanho: 82,
    cor_texto: "#FFFFFF",
    padding_vertical: 34,
    espaco_linha: 8,
    largura: 1,
    sombra_offset: 4,
    sombra_cor: "#00000055",
    contorno_largura: 0,
    contorno_cor: "#000000",
    posicao_vertical: 0.66,
  },
  layout: {
    divisao_padrao: 0.55,
    foco_video_padrao: 0.5,
    foco_imagem_padrao: 0.5,
  },
  edicao: {
    punch_in: {
      ativo: true,
      zoom: 1.08,
      a_cada: "frase",
      segundos: 4,
    },
  },
  render: {
    concorrencia: 4,
    sobrescrever_existentes: false,
    padrao_nome: "{hook}_{body}_{cta}",
    prefixo: "",
    arquivos_unicos: true,
    leva_atual: "",
  },
};

export function loadConfig(): Config {
  try {
    const raw = fs.readFileSync(CONFIG_JSON, "utf8");
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, parsed);
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: Config): void {
  const merged = deepMerge(DEFAULT_CONFIG, cfg);
  fs.writeFileSync(CONFIG_JSON, JSON.stringify(merged, null, 2) + "\n", "utf8");
}
