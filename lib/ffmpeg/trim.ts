import { run } from "./exec";
import type { Config } from "../types";

/**
 * Detect leading/trailing silence and return trim points. We ONLY trim the
 * ends — never interior silence (that would wreck timing/pacing).
 *
 * silencedetect emits `silence_start: X` / `silence_end: Y | silence_duration`.
 * A leading silence is a block whose start ≈ 0. A trailing silence is a block
 * with a start but no end (runs to EOF).
 */
export async function detectTrim(
  cfg: Config,
  file: string,
  duration: number
): Promise<{ start: number; end: number }> {
  if (!cfg.trim.auto_trim_silence) return { start: 0, end: duration };

  const { stderr } = await run(
    cfg.bin.ffmpeg,
    [
      "-hide_banner",
      "-vn", // audio only: never decode the video just to find silence
      "-i",
      file,
      "-af",
      `silencedetect=noise=${cfg.trim.silence_threshold_db}dB:d=${cfg.trim.silence_min_duration}`,
      "-f",
      "null",
      "-",
    ],
    { allowFail: true }
  );

  const starts: number[] = [];
  const ends: number[] = [];
  for (const line of stderr.split("\n")) {
    const ms = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (ms) starts.push(parseFloat(ms[1]));
    const me = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (me) ends.push(parseFloat(me[1]));
  }

  let trimStart = 0;
  let trimEnd = duration;

  // Leading silence: a block starting at ~0 with a matching end.
  if (starts.length && starts[0] <= 0.05 && ends.length) {
    trimStart = Math.max(0, ends[0] - cfg.trim.padding_start);
  }

  // Trailing silence: a start with no following end (runs to EOF).
  if (starts.length > ends.length) {
    const lastStart = starts[starts.length - 1];
    if (lastStart > trimStart) {
      trimEnd = Math.min(duration, lastStart + cfg.trim.padding_end);
    }
  }

  // Guard against nonsense (overlap / negative window).
  if (trimEnd - trimStart < 0.2) return { start: 0, end: duration };
  return { start: trimStart, end: trimEnd };
}
