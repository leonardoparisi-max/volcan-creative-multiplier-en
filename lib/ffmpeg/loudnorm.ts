import { run } from "./exec";
import type { Config } from "../types";

export interface LoudnormMeasured {
  measured_I: string;
  measured_TP: string;
  measured_LRA: string;
  measured_thresh: string;
  offset: string;
}

/**
 * First pass of two-pass loudnorm: measure. We apply the same trim window and
 * denoise as the real pass so the measurement reflects what we'll actually
 * encode. Returns the measured values to feed into the second (apply) pass.
 */
export async function measureLoudness(
  cfg: Config,
  file: string,
  window: { start: number; end: number },
  audioPrefilter: string
): Promise<LoudnormMeasured | null> {
  const dur = Math.max(0.05, window.end - window.start);
  const measure = `loudnorm=I=${cfg.audio.loudnorm_target_i}:TP=${cfg.audio.loudnorm_target_tp}:LRA=${cfg.audio.loudnorm_target_lra}:print_format=json`;
  const af = [audioPrefilter, measure].filter(Boolean).join(",");

  const { stderr } = await run(
    cfg.bin.ffmpeg,
    [
      "-hide_banner",
      "-vn", // audio only: the video decode was the cost, not loudnorm
      "-ss",
      window.start.toFixed(3),
      "-t",
      dur.toFixed(3),
      "-i",
      file,
      "-af",
      af,
      "-f",
      "null",
      "-",
    ],
    { allowFail: true }
  );

  // loudnorm prints a JSON block at the end of stderr.
  const match = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!match) return null;
  try {
    const j = JSON.parse(match[0]);
    return {
      measured_I: j.input_i,
      measured_TP: j.input_tp,
      measured_LRA: j.input_lra,
      measured_thresh: j.input_thresh,
      offset: j.target_offset,
    };
  } catch {
    return null;
  }
}

/** Build the second-pass loudnorm filter string using measured values. */
export function loudnormApplyFilter(
  cfg: Config,
  m: LoudnormMeasured | null
): string {
  const base = `loudnorm=I=${cfg.audio.loudnorm_target_i}:TP=${cfg.audio.loudnorm_target_tp}:LRA=${cfg.audio.loudnorm_target_lra}`;
  if (!m) return base; // graceful fallback to single-pass if measure failed
  return (
    base +
    `:measured_I=${m.measured_I}:measured_TP=${m.measured_TP}` +
    `:measured_LRA=${m.measured_LRA}:measured_thresh=${m.measured_thresh}` +
    `:offset=${m.offset}:linear=true`
  );
}

/** The denoise prefilter applied consistently in both passes. */
export function denoiseFilter(cfg: Config): string {
  if (!cfg.audio.denoise) return "";
  // afftdn nr is roughly 0-97 dB; map 0..1 strength → gentle range.
  const nr = Math.max(0.01, Math.min(97, cfg.audio.denoise_strength * 40));
  return `afftdn=nr=${nr.toFixed(2)}:nf=-25`;
}
