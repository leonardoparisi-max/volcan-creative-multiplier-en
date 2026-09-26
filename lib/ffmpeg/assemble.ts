import fs from "node:fs";
import path from "node:path";
import { run } from "./exec";
import { probeStreams, BT709_ARGS } from "./normalize";
import type { Config, TransitionType } from "../types";

export interface Segment {
  path: string;
  duration: number;
}

/** Masters are always encoded at this rate (normalize.ts: -ar 48000). */
const MASTER_SAMPLE_RATE = 48000;

/**
 * Timeline of the assembled creative, computed on the FRAME grid so video and
 * audio agree to the sample: segment i starts at frame Σ(frames before) − i·dF.
 * (Floating offsets rounded to 3 decimals were adding a frame per transition,
 * and `acrossfade` was dropping ~34 ms per transition — see REVIEW.md B1.)
 */
export function timeline(
  segs: Segment[],
  tipo: TransitionType,
  dTrans: number,
  fps: number
): { frames: number[]; dF: number; dS: number; startsF: number[]; totalF: number } {
  const frames = segs.map((s) => Math.max(1, Math.round(s.duration * fps)));
  const dF = tipo === "cut" ? 0 : Math.max(1, Math.round(dTrans * fps));
  const startsF: number[] = [];
  let cum = 0;
  for (let i = 0; i < frames.length; i++) {
    startsF.push(cum - i * dF);
    cum += frames[i];
  }
  const totalF = cum - (frames.length - 1) * dF;
  return { frames, dF, dS: dF / fps, startsF, totalF };
}

/** Final duration after transition overlaps: Σdur − (nTransitions × dTrans), frame-exact. */
export function finalDuration(
  segs: Segment[],
  tipo: TransitionType,
  dTrans: number,
  fps = 30
): number {
  if (!segs.length) return 0;
  return timeline(segs, tipo, dTrans, fps).totalF / fps;
}

function edgeColor(kind: "fadeblack" | "fadewhite"): string {
  return kind === "fadewhite" ? "white" : "black";
}

/**
 * Build filter_complex to join segments with the configured transition, then
 * apply opener/closer. Video via xfade (or plain concat for `cut`); audio via
 * acrossfade (which overlaps by the same duration, keeping A/V in lockstep).
 */
function buildFilter(
  cfg: Config,
  segs: Segment[],
  total: number
): { filter: string; vOut: string; aOut: string } {
  const { tipo } = cfg.transicao;
  const fps = cfg.video.fps;
  const parts: string[] = [];
  let vLabel: string;
  let aLabel: string;

  if (tipo === "cut" || segs.length === 1) {
    // plain concat (frame/sample exact by construction)
    const inputs = segs.map((_, i) => `[${i}:v][${i}:a]`).join("");
    parts.push(`${inputs}concat=n=${segs.length}:v=1:a=1[vc][ac]`);
    vLabel = "vc";
    aLabel = "ac";
  } else {
    const tl = timeline(segs, tipo, cfg.transicao.duracao, fps);
    const f6 = (x: number) => x.toFixed(6);
    const dS = f6(tl.dS);

    // video: progressive xfade, offsets on the frame grid
    let prevV = `0:v`;
    for (let i = 1; i < segs.length; i++) {
      const out = i === segs.length - 1 ? "vx" : `vx${i}`;
      parts.push(
        `[${prevV}][${i}:v]xfade=transition=${tipo}:duration=${dS}:offset=${f6(
          tl.startsF[i] / fps
        )}[${out}]`
      );
      prevV = out;
    }
    vLabel = "vx";

    // audio: each segment faded at its seams and placed at its exact start
    // (in samples), then mixed — an explicit timeline instead of acrossfade.
    const aLabels: string[] = [];
    for (let i = 0; i < segs.length; i++) {
      const chain: string[] = [];
      if (i > 0) chain.push(`afade=t=in:st=0:d=${dS}:curve=tri`);
      if (i < segs.length - 1) {
        chain.push(
          `afade=t=out:st=${f6((tl.frames[i] - tl.dF) / fps)}:d=${dS}:curve=tri`
        );
      }
      const startSamples = Math.round((tl.startsF[i] / fps) * MASTER_SAMPLE_RATE);
      chain.push(`adelay=delays=${startSamples}S:all=1`);
      parts.push(`[${i}:a]${chain.join(",")}[a${i}]`);
      aLabels.push(`[a${i}]`);
    }
    parts.push(
      `${aLabels.join("")}amix=inputs=${segs.length}:normalize=0:dropout_transition=0,` +
        `atrim=0:${f6(tl.totalF / fps)},asetpts=PTS-STARTPTS[ax]`
    );
    aLabel = "ax";
  }

  // opener / closer on the assembled stream
  const vChain: string[] = [];
  const aChain: string[] = [];
  const { abertura, abertura_duracao, fechamento, fechamento_duracao } =
    cfg.transicao;

  if (abertura !== "none") {
    vChain.push(
      `fade=t=in:st=0:d=${abertura_duracao}:color=${edgeColor(abertura)}`
    );
    aChain.push(`afade=t=in:st=0:d=${abertura_duracao}`);
  }
  if (fechamento !== "none") {
    const st = Math.max(0, total - fechamento_duracao);
    vChain.push(
      `fade=t=out:st=${st.toFixed(3)}:d=${fechamento_duracao}:color=${edgeColor(
        fechamento
      )}`
    );
    aChain.push(`afade=t=out:st=${st.toFixed(3)}:d=${fechamento_duracao}`);
  }

  let vOut = vLabel;
  let aOut = aLabel;
  if (vChain.length) {
    parts.push(`[${vLabel}]${vChain.join(",")}[vout]`);
    vOut = "vout";
  }
  if (aChain.length) {
    parts.push(`[${aLabel}]${aChain.join(",")}[aout]`);
    aOut = "aout";
  }

  return { filter: parts.join(";"), vOut, aOut };
}

/** "10M" → bits/s (for maxrate/bufsize derivation). */
function bitrateBps(s: string): number {
  const m = /^([\d.]+)\s*([kKmMgG]?)/.exec(String(s).trim());
  if (!m) return 10_000_000;
  const mult = { g: 1e9, m: 1e6, k: 1e3, "": 1 }[m[2].toLowerCase()] ?? 1;
  return parseFloat(m[1]) * mult;
}

/**
 * Final encoder: H.264 High profile, keyframe every 2 s, capped bitrate (VBV) so
 * the platform's re-encode gets a clean, predictable stream; bt709 tagged.
 */
function encoderArgs(cfg: Config): string[] {
  const bps = bitrateBps(cfg.video.bitrate_final);
  const cap = [
    "-maxrate", String(Math.round(bps * 1.25)),
    "-bufsize", String(Math.round(bps * 2.5)),
    "-g", String(cfg.video.fps * 2),
    "-pix_fmt", "yuv420p",
    ...BT709_ARGS,
  ];
  if (cfg.video.encoder === "libx264") {
    return [
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-profile:v", "high",
      "-b:v", cfg.video.bitrate_final,
      ...cap,
    ];
  }
  return [
    "-c:v", "h264_videotoolbox",
    "-profile:v", "high",
    "-b:v", cfg.video.bitrate_final,
    ...cap,
  ];
}

/**
 * Optional per-file uniqueness metadata. Injected as container tags so the
 * file has a distinct title and comment (Meta compares pixel content, not
 * metadata — this rarely matters, hence optional). Costs nothing extra: the
 * final encode already runs, tags just ride along.
 */
export interface UniqueMeta {
  title: string;
  comment: string;
  creationTime?: string; // ISO 8601 — omitted by default (no jitter)
}

function uniqueArgs(u?: UniqueMeta): string[] {
  if (!u) return [];
  return [
    "-metadata", `title=${u.title}`,
    "-metadata", `comment=${u.comment}`,
    ...(u.creationTime ? ["-metadata", `creation_time=${u.creationTime}`] : []),
    "-metadata", `encoder=Volcan Creative Multiplier`,
  ];
}

/**
 * Render one combination to outPath. Returns the MEASURED final duration
 * (ffprobe of the video stream), not the arithmetic estimate. Writes to a temp
 * file and renames on success so a killed job never leaves a half mp4 behind.
 */
export async function renderCombination(
  cfg: Config,
  segs: Segment[],
  outPath: string,
  unique?: UniqueMeta,
  warnings?: string[]
): Promise<number> {
  const total = finalDuration(
    segs,
    cfg.transicao.tipo,
    cfg.transicao.duracao,
    cfg.video.fps
  );
  const { filter, vOut, aOut } = buildFilter(cfg, segs, total);

  const inputs: string[] = [];
  for (const s of segs) inputs.push("-i", s.path);
  const tmpPath = outPath.replace(/\.mp4$/i, "") + ".tmp.mp4";

  const args = [
    "-hide_banner",
    "-y",
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    `[${vOut}]`,
    "-map",
    `[${aOut}]`,
    ...encoderArgs(cfg),
    "-r",
    String(cfg.video.fps),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    ...uniqueArgs(unique),
    "-movflags",
    "+faststart",
    tmpPath,
  ];

  // Expected frame count on the grid; a busy machine once produced one frame
  // short (REVIEW.md batch 1). Verify and re-encode once before accepting.
  const fps = cfg.video.fps;
  const expectedFrames =
    cfg.transicao.tipo === "cut" || segs.length === 1
      ? segs.reduce((a, s) => a + Math.round(s.duration * fps), 0)
      : timeline(segs, cfg.transicao.tipo, cfg.transicao.duracao, fps).totalF;

  let info: Awaited<ReturnType<typeof probeStreams>> | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await run(cfg.bin.ffmpeg, args);
    } catch (e) {
      fs.rmSync(tmpPath, { force: true });
      throw e;
    }
    info = await probeStreams(cfg, tmpPath);
    if (!info.video) {
      fs.rmSync(tmpPath, { force: true });
      throw new Error("output has no video stream");
    }
    const frames = info.videoFrames ?? Math.round(info.video * fps);
    const audioOk = info.audio == null || Math.abs(info.audio - info.video) <= 1.5 / fps;
    if (Math.abs(frames - expectedFrames) <= 1 && audioOk) break;
    if (attempt === 2) {
      // keep the file (it is playable) but make the discrepancy visible
      warnings?.push(
        `${path.basename(outPath)}: ${frames} frames (expected ${expectedFrames})` +
          (audioOk ? "" : `, audio ${info.audio?.toFixed(3)}s ≠ video ${info.video.toFixed(3)}s`)
      );
    }
  }
  fs.renameSync(tmpPath, outPath);
  return info!.video as number;
}

export function fileSizeMb(p: string): number {
  try {
    return +(fs.statSync(p).size / (1024 * 1024)).toFixed(2);
  } catch {
    return 0;
  }
}
