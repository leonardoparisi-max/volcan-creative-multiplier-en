import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { run } from "./exec";
import { probe } from "./probe";
import { detectTrim } from "./trim";
import {
  measureLoudness,
  loudnormApplyFilter,
  denoiseFilter,
} from "./loudnorm";
import { buildAss, buildOverlayAss } from "./ass";
import { buildTarja } from "./tarja";
import { getTranscript, editedTranscriptPath } from "../whisper";
import { resolveFont } from "../fonts";
import { hashFile } from "../hash";
import { escapeFilterPath } from "../escape";
import { NORMALIZED_DIR, imagesDir } from "../paths";
import type { Config, ComponentRow, Word } from "../types";

export interface MasterResult {
  path: string;
  duration: number; // trimmed master duration (seconds)
  cached: boolean;
  key: string; // the master cache key — feeds the render's versao_id
  texto?: string; // overlay text, else first ~12 words of the transcript (for the manifest)
}

/**
 * Composite cache key: source hash + the config that actually affects the
 * rendered master + this component's own text/layout choice (including the
 * image's hash when a split layout is used). Change the file, the image, or the
 * styling and it reprocesses; leave them and it's a cache hit.
 */
/**
 * Bump when the master pipeline itself changes (not the config). Old masters
 * then miss the cache and are rebuilt with the corrected chain.
 *  v2: audio padded/trimmed to the exact video length; duration snapped to
 *      the frame grid; atomic writes; duration measured on the video stream.
 *  v3: HDR (HLG/PQ bt2020) tone-mapped to bt709 (swscale, perceptual intent);
 *      every master tagged bt709; "simples" text rendered via libass (wraps).
 *  v4: colour conversion applied to EVERY input (unknown-tagged SDR is treated
 *      as bt709, RGB images get the bt709 matrix) and frame properties forced
 *      with setparams — the encoder options alone left primaries/trc "unknown".
 *  v5: caption lines break at sentence punctuation.
 *  v6: punch-in (alternating zoom cut at phrase/interval boundaries).
 */
const PIPELINE_VERSION = 6;

/** Output colour tags — every master and every final file is plain SDR bt709. */
export const BT709_ARGS = [
  "-color_primaries", "bt709",
  "-color_trc", "bt709",
  "-colorspace", "bt709",
  "-color_range", "tv",
];

/** Content signature of the hand-edited caption, if one was saved — "" otherwise. */
function editedSignature(srcHash: string, language: string): string {
  try {
    const raw = fs.readFileSync(editedTranscriptPath(srcHash, language), "utf8");
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 12);
  } catch {
    return "";
  }
}

/** row.punch_in overrides the global edicao.punch_in.ativo when set. */
function punchInEnabled(cfg: Config, row: ComponentRow): boolean {
  return row.punch_in ?? cfg.edicao.punch_in.ativo;
}

/**
 * Time boundaries (seconds) where the punch-in should alternate. "frase" keys
 * off sentence-ending punctuation in the transcript (min 1.2s apart, so two
 * short sentences back to back don't flicker); falls back to a fixed interval
 * when there's no punctuation to key off (e.g. no speech, or "segundos" mode).
 */
function punchBoundaries(
  words: Word[],
  mode: "frase" | "segundos",
  segundos: number,
  totalDur: number
): number[] {
  if (mode === "frase" && words.length) {
    const bounds: number[] = [];
    for (const w of words) {
      if (/[.!?]$/.test(w.text.trim())) {
        if (!bounds.length || w.end - bounds[bounds.length - 1] >= 1.2) bounds.push(w.end);
      }
    }
    if (bounds.length) return bounds.filter((b) => b < totalDur - 0.3);
  }
  const step = Math.max(1, segundos);
  const out: number[] = [];
  for (let t = step; t < totalDur - 0.3; t += step) out.push(t);
  return out;
}

/**
 * ffmpeg expression alternating 1 / zoom at each boundary, as a nested
 * if(lt(t,b),thisSeg,rest) chain. Commas inside are backslash-escaped — the
 * filtergraph parser otherwise reads them as argument separators.
 */
function punchExpr(bounds: number[], zoom: number): string {
  if (!bounds.length) return "1";
  const segVal = (i: number) => (i % 2 === 0 ? "1" : zoom.toFixed(4));
  let expr = segVal(bounds.length);
  for (let i = bounds.length - 1; i >= 0; i--) {
    expr = `if(lt(t\\,${bounds[i].toFixed(3)})\\,${segVal(i)}\\,${expr})`;
  }
  return expr;
}

/**
 * Zoom-crop chain for one labeled input → labeled output: upscales by the
 * (time-varying) zoom factor then crops back to W×H, so it reads as a punch-in
 * cut rather than a resize. Cheap (plain arithmetic per frame, no zoompan), so
 * it doesn't meaningfully add to ingestion time.
 */
function punchChain(inLabel: string, outLabel: string, w: number, h: number, expr: string): string {
  return (
    `[${inLabel}]crop=w='floor((${w}/(${expr}))/2)*2':h='floor((${h}/(${expr}))/2)*2':` +
    `x='(in_w-out_w)/2':y='(in_h-out_h)/2',scale=${w}:${h}[${outLabel}]`
  );
}

function masterKey(
  cfg: Config,
  row: ComponentRow,
  srcHash: string,
  imgHash: string
): string {
  const relevant = {
    pipe: PIPELINE_VERSION,
    v: cfg.video,
    a: cfg.audio,
    t: cfg.trim,
    leg: cfg.legenda,
    ov: cfg.overlay_hook,
    tarja: cfg.tarja,
    legenda_ativa: row.legenda_ativa,
    texto_overlay: row.texto_overlay,
    texto_estilo: row.texto_estilo,
    texto_posicao: row.texto_posicao,
    layout: row.layout,
    imagem: row.imagem,
    imgHash,
    split_mudo: row.split_mudo ?? true,
    divisao: row.divisao,
    foco_video: row.foco_video,
    foco_imagem: row.foco_imagem,
    // saving an edited caption must invalidate the cached master, otherwise
    // the correction never reaches the burned-in subtitles.
    legendaEditada: editedSignature(srcHash, cfg.whisper.language),
    punchIn: punchInEnabled(cfg, row) ? cfg.edicao.punch_in : null,
  };
  const h = crypto.createHash("sha256");
  h.update(srcHash);
  h.update(JSON.stringify(relevant));
  return h.digest("hex").slice(0, 20);
}

export interface NormalizeDeps {
  onLog?: (msg: string) => void;
}

/**
 * HDR → SDR inside the scale step. This ffmpeg build has no zscale/libplacebo,
 * but its swscale (FFmpeg ≥ 7.1) converts primaries/transfer with tone mapping;
 * `perceptual` was the most natural of the intents on real iPhone HLG footage
 * (see REVIEW.md batch 2). Applied to every input (identity for bt709 sources,
 * bt709 matrix for RGB images) so all masters are genuinely bt709.
 */
const TO_BT709 =
  ":out_primaries=bt709:out_transfer=bt709:out_color_matrix=bt709:intent=perceptual";

/** scale-to-cover + focus crop for one labeled input → labeled output. */
function coverChain(
  inLabel: string,
  outLabel: string,
  w: number,
  h: number,
  foco: number,
  prefix = ""
): string {
  const f = Math.min(1, Math.max(0, foco));
  return (
    `[${inLabel}]${prefix}scale=${w}:${h}:force_original_aspect_ratio=increase${TO_BT709},` +
    `crop=${w}:${h}:(iw-ow)/2:(ih-oh)*${f},setsar=1[${outLabel}]`
  );
}

function evenSplit(total: number, topFrac: number): { top: number; bot: number } {
  const t = Math.round((total * Math.min(0.9, Math.max(0.1, topFrac))) / 2) * 2;
  return { top: t, bot: total - t };
}

/**
 * Produce (or reuse) the normalized master for one component. Composes the
 * frame (full-bleed or video+image split), then burns the on-screen text
 * (karaoke caption, gradient "tarja", or plain overlay) INTO the component —
 * never into the final combination.
 */
export async function buildMaster(
  cfg: Config,
  row: ComponentRow,
  srcFile: string,
  srcHash: string,
  deps: NormalizeDeps = {}
): Promise<MasterResult> {
  const { width: W, height: H, fps } = cfg.video;

  // ---- resolve the split media up-front (its hash feeds the cache key) ----
  // The split slot takes an IMAGE or a VIDEO. A split video is muted by default
  // (split_mudo) so the master keeps only the base clip's audio.
  const wantSplit = row.layout === "imagem_cima" || row.layout === "imagem_baixo";
  const splitIsVideo = /\.(mp4|mov|m4v|webm|mkv)$/i.test(row.imagem || "");
  const splitMuted = row.split_mudo !== false;
  let imagePath = "";
  let imgHash = "";
  let splitHasAudio = false;
  if (wantSplit && row.imagem) {
    const p = path.join(imagesDir(cfg), row.imagem);
    if (fs.existsSync(p)) {
      imagePath = p;
      imgHash = (await hashFile(p)).slice(0, 16);
      if (splitIsVideo) {
        const si = await probe(cfg, imagePath, imgHash);
        splitHasAudio = si.hasAudio;
      }
    } else {
      deps.onLog?.(`  ${row.id}: split media missing (${row.imagem}) — using full video`);
    }
  }
  const useSplit = wantSplit && !!imagePath;

  const key = masterKey(cfg, row, srcHash, imgHash);
  const outPath = path.join(NORMALIZED_DIR, `${key}.mp4`);
  const metaPath = path.join(NORMALIZED_DIR, `${key}.json`);
  const tmpPath = path.join(NORMALIZED_DIR, `${key}.tmp.mp4`);

  if (fs.existsSync(outPath) && fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (typeof meta.duration === "number" && meta.duration > 0) {
        return {
          path: outPath,
          duration: meta.duration,
          cached: true,
          key,
          texto: meta.texto ?? meta.hookText, // meta.hookText: pre-batch-4 cache entries
        };
      }
    } catch {
      /* rebuild */
    }
  }
  // leftovers from a crashed/killed encode (no sidecar → never valid)
  for (const p of [outPath, metaPath, tmpPath]) fs.rmSync(p, { force: true });

  const info = await probe(cfg, srcFile, srcHash);
  const window = await detectTrim(cfg, srcFile, info.duration);
  // Snap the master length to the output frame grid so video (N frames) and
  // audio (padded/trimmed to the same T) come out with identical durations.
  // Without this, xfade (video Σ) and acrossfade (audio Σ) drift apart.
  const trimmedDur = Math.max(
    1 / fps,
    Math.floor((window.end - window.start) * fps) / fps
  );
  const hdr = !!info.isHdr;
  deps.onLog?.(
    `  ${row.id}: trim ${window.start.toFixed(2)}→${window.end.toFixed(2)}s` +
      (useSplit ? ` · split ${row.layout}` : "") +
      (hdr ? ` · HDR (${info.colorTransfer}) → bt709` : "")
  );

  // ---- decide text mode ----
  const hasOverlay = row.texto_overlay.trim().length > 0;
  const wantCaption = row.legenda_ativa && !hasOverlay;

  // Always transcribe when there's audio — even with tarja/overlay or captions
  // off — so .cache/transcripts/ and the manifest's texto column are complete,
  // and the Kanban/Connections preview has something to show. Cached by
  // srcHash+language only, so this is a no-op after the first pass.
  let transcript: { words: Word[]; text: string } | null = null;
  if (info.hasAudio) {
    deps.onLog?.(`  ${row.id}: transcribing…`);
    transcript = await getTranscript(cfg, srcFile, srcHash, window);
    if (!transcript.words.length) {
      deps.onLog?.(`  ${row.id}: no speech detected`);
    }
  }

  // ---- audio: denoise + 2-pass loudnorm ----
  const pre = denoiseFilter(cfg);
  const measured = await measureLoudness(cfg, srcFile, window, pre);
  const audioFilter =
    [pre, loudnormApplyFilter(cfg, measured)].filter(Boolean).join(",") || "anull";

  // ---- assemble inputs + video filtergraph ----
  const inputs: string[] = [
    "-ss",
    window.start.toFixed(3),
    "-t",
    trimmedDur.toFixed(3),
    "-i",
    srcFile,
  ];
  let idx = 1;
  let splitInputIdx = -1;
  const chains: string[] = [];

  // 1) base composition → [base]
  if (useSplit) {
    if (splitIsVideo) {
      // loop the split video to fill the base clip's trimmed duration
      inputs.push("-stream_loop", "-1", "-t", trimmedDur.toFixed(3), "-i", imagePath);
    } else {
      inputs.push("-loop", "1", "-t", trimmedDur.toFixed(3), "-r", String(fps), "-i", imagePath);
    }
    const imgIdx = idx++;
    splitInputIdx = imgIdx;
    const { top, bot } = evenSplit(H, row.divisao ?? cfg.layout.divisao_padrao);
    const imageTop = row.layout === "imagem_cima";
    const vidH = imageTop ? bot : top;
    const imgH = imageTop ? top : bot;

    chains.push(coverChain("0:v", "vid", W, vidH, row.foco_video, `fps=${fps},`));
    // normalize the split video's fps too; images are already at -r fps
    chains.push(
      coverChain(`${imgIdx}:v`, "img", W, imgH, row.foco_imagem, splitIsVideo ? `fps=${fps},` : "")
    );
    const order = imageTop ? "[img][vid]" : "[vid][img]";
    chains.push(`${order}vstack=inputs=2[base]`);
  } else {
    chains.push(coverChain("0:v", "base", W, H, row.foco_video || 0.5, `fps=${fps},`));
  }

  // 1b) punch-in: alternating zoom cut on the base composition, applied
  // BEFORE any text is burned in so captions/overlay stay crisp, not zoomed.
  let baseLabel = "base";
  if (punchInEnabled(cfg, row)) {
    const bounds = punchBoundaries(
      transcript?.words ?? [],
      cfg.edicao.punch_in.a_cada,
      cfg.edicao.punch_in.segundos,
      trimmedDur
    );
    if (bounds.length) {
      chains.push(punchChain("base", "basez", W, H, punchExpr(bounds, cfg.edicao.punch_in.zoom)));
      baseLabel = "basez";
      deps.onLog?.(`  ${row.id}: punch-in at ${bounds.length} cut(s)`);
    }
  }

  // 2) text layer on [baseLabel] → [styled]
  let styled = baseLabel;

  if (wantCaption) {
    const words = transcript?.words ?? [];
    if (words.length) {
      const assPath = buildAss(cfg, key, words);
      if (assPath) {
        const font = await resolveFont(cfg.legenda.fonte);
        const sub =
          `subtitles=filename='${escapeFilterPath(assPath)}'` +
          (font.dir ? `:fontsdir='${escapeFilterPath(font.dir)}'` : "");
        chains.push(`[${baseLabel}]${sub}[styled]`);
        styled = "styled";
      }
    } else {
      deps.onLog?.(`  ${row.id}: no speech detected, no caption`);
    }
  } else if (hasOverlay) {
    if (row.texto_estilo === "tarja") {
      const tarja = await buildTarja(cfg, row.texto_overlay);
      if (tarja) {
        inputs.push("-i", tarja.path);
        const tIdx = idx++;
        const yExpr = `(H*${row.texto_posicao})-h/2`;
        chains.push(
          `[${baseLabel}][${tIdx}:v]overlay=x=(W-w)/2:y=${yExpr}:format=auto[styled]`
        );
        styled = "styled";
      }
    } else {
      // plain text via libass: wraps inside the safe width, handles any character
      const font = await resolveFont(cfg.overlay_hook.fonte);
      if (!font.file) {
        throw new Error(
          `Text font not found: ${cfg.overlay_hook.fonte}. Install it in ~/Library/Fonts.`
        );
      }
      const assPath = buildOverlayAss(cfg, key, row.texto_overlay, row.texto_posicao, trimmedDur);
      const sub =
        `subtitles=filename='${escapeFilterPath(assPath)}'` +
        (font.dir ? `:fontsdir='${escapeFilterPath(font.dir)}'` : "");
      chains.push(`[${baseLabel}]${sub}[styled]`);
      styled = "styled";
    }
  }

  // manifest text: overlay wins; otherwise the first ~12 words actually said.
  const texto = hasOverlay
    ? row.texto_overlay.replace(/\|/g, " ").trim()
    : transcript?.words.length
    ? transcript.words.slice(0, 12).map((w) => w.text).join(" ")
    : "";

  const T = trimmedDur.toFixed(3);
  chains.push(
    `[${styled}]format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,` +
      `trim=duration=${T},setpts=PTS-STARTPTS[vout]`
  );

  // 3) audio → [aout]. Base clip audio, optionally mixed with the split video's
  // audio when it is NOT muted (the uncommon "two audios" case).
  const mapArgs: string[] = ["-map", "[vout]"];
  let baseA: string;
  if (info.hasAudio) {
    chains.push(`[0:a]${audioFilter}[abase]`);
    baseA = "abase";
  } else {
    inputs.push(
      "-f",
      "lavfi",
      "-t",
      trimmedDur.toFixed(3),
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000"
    );
    baseA = `${idx++}:a`;
  }

  // Force audio length == video length: pad silence if the track is shorter
  // (common: audio ends early, or 30–100 ms off on iPhone .mov), trim if longer.
  const fitAudio = `apad,atrim=0:${T},asetpts=PTS-STARTPTS`;
  if (useSplit && splitIsVideo && !splitMuted && splitHasAudio) {
    chains.push(
      `[${baseA}][${splitInputIdx}:a]amix=inputs=2:duration=first:normalize=0,${fitAudio}[aout]`
    );
  } else {
    chains.push(`[${baseA}]${fitAudio}[aout]`);
  }
  mapArgs.push("-map", "[aout]");

  const args = [
    "-hide_banner",
    "-y",
    ...inputs,
    "-filter_complex",
    chains.join(";"),
    ...mapArgs,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    String(cfg.video.crf_master),
    "-pix_fmt",
    "yuv420p",
    ...BT709_ARGS,
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    T,
    "-movflags",
    "+faststart",
    tmpPath,
  ];
  try {
    await run(cfg.bin.ffmpeg, args, { onStderr: () => {} });
  } catch (e) {
    fs.rmSync(tmpPath, { force: true });
    throw e;
  }

  // Validate before publishing into the cache: the master must be readable and
  // its audio and video streams must have the same length (≤ 1 frame apart).
  const finalInfo = await probeStreams(cfg, tmpPath);
  if (!finalInfo.video) {
    fs.rmSync(tmpPath, { force: true });
    throw new Error(`master has no video stream (${row.id})`);
  }
  const drift = Math.abs(finalInfo.video - (finalInfo.audio ?? finalInfo.video));
  if (drift > 1.5 / fps) {
    fs.rmSync(tmpPath, { force: true });
    throw new Error(
      `master has mismatched audio and video lengths (${row.id}: video ${finalInfo.video.toFixed(3)}s, audio ${finalInfo.audio?.toFixed(3)}s)`
    );
  }
  // Atomic publish: mp4 first, then the meta sidecar (cache hit requires both).
  fs.renameSync(tmpPath, outPath);
  const meta = { duration: finalInfo.video, texto };
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  return { path: outPath, duration: finalInfo.video, cached: false, key, texto };
}

/** Per-stream durations of a finished file (video is the reference length). */
export async function probeStreams(
  cfg: Config,
  file: string
): Promise<{ video: number | null; audio: number | null; container: number; videoFrames: number | null }> {
  const { stdout } = await run(cfg.bin.ffprobe, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const data = JSON.parse(stdout);
  const dur = (s: any): number | null => {
    if (!s) return null;
    const d = parseFloat(s.duration ?? "");
    if (Number.isFinite(d)) return d;
    // some muxers only expose nb_frames/frame rate
    const n = parseInt(s.nb_frames ?? "", 10);
    const [a, b] = String(s.avg_frame_rate ?? "0/1").split("/").map(Number);
    return n && a && b ? n / (a / b) : null;
  };
  const v = (data.streams || []).find((s: any) => s.codec_type === "video");
  const a = (data.streams || []).find((s: any) => s.codec_type === "audio");
  const nf = parseInt(v?.nb_frames ?? "", 10);
  return {
    video: dur(v),
    audio: dur(a),
    container: parseFloat(data.format?.duration ?? "0") || 0,
    videoFrames: Number.isFinite(nf) ? nf : null,
  };
}
