import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { run } from "./ffmpeg/exec";
import { TRANSCRIPTS_DIR } from "./paths";
import type { Config, Word } from "./types";

// whisper-cli maps a 1.5 GB model and uses every core it is given; running 4
// of them at once (ingest concurrency) on an 8-core / 8 GB Mac made a 3 s clip
// take 35 s instead of 2 s (measured). One transcription at a time, threads
// capped at the core count.
let whisperQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = whisperQueue.then(fn, fn);
  whisperQueue = next.catch(() => {});
  return next;
}

/**
 * Transcribe a media file to per-WORD timings using whisper.cpp (whisper-cli).
 *
 * whisper.cpp needs 16kHz mono WAV. We extract from the ALREADY-TRIMMED window
 * of the source so subtitle times line up with the master's timeline (t=0 at
 * the trim start). `-ml 1 -sow` forces one word per segment; `-oj` gives JSON
 * with millisecond offsets.
 */
export async function transcribeWords(
  cfg: Config,
  file: string,
  window: { start: number; end: number }
): Promise<Word[]> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cc-whisper-"));
  const wav = path.join(tmp, "audio.wav");
  const outBase = path.join(tmp, "out");
  const dur = Math.max(0.05, window.end - window.start);

  try {
    // 1. extract normalized 16k mono wav of the trimmed window
    await run(cfg.bin.ffmpeg, [
      "-hide_banner",
      "-y",
      "-vn",
      "-ss",
      window.start.toFixed(3),
      "-t",
      dur.toFixed(3),
      "-i",
      file,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      wav,
    ]);

    // 2. whisper-cli → JSON with per-word segments
    const args = [
      "-m",
      cfg.whisper.model_path,
      "-f",
      wav,
      "-oj",
      "-of",
      outBase,
      "-ml",
      "1",
      "-sow",
      "-t",
      String(Math.max(1, Math.min(cfg.whisper.threads || 8, os.cpus().length))),
      "-np", // no prints (quiet)
    ];
    if (cfg.whisper.language && cfg.whisper.language !== "auto") {
      args.push("-l", cfg.whisper.language);
    }
    await serialized(() => run(cfg.bin.whisper, args, { allowFail: true }));

    // 3. parse JSON
    const jsonPath = `${outBase}.json`;
    if (!fs.existsSync(jsonPath)) return [];
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const segs: any[] = data.transcription || [];
    const words: Word[] = [];
    for (const s of segs) {
      const text = (s.text || "").trim();
      if (!text) continue;
      const fromMs = s.offsets?.from ?? 0;
      const toMs = s.offsets?.to ?? fromMs;
      words.push({
        start: fromMs / 1000,
        end: Math.max(fromMs / 1000 + 0.05, toMs / 1000),
        text,
      });
    }
    return words;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function transcriptPath(srcHash: string, language: string): string {
  const lang = language && language !== "auto" ? language : "auto";
  return path.join(TRANSCRIPTS_DIR, `${srcHash}_${lang}.json`);
}

/** Hand-edited version of the same transcript — text only, timings untouched. */
export function editedTranscriptPath(srcHash: string, language: string): string {
  return transcriptPath(srcHash, language).replace(/\.json$/, ".edited.json");
}

/** Read a transcript file (raw or edited) without transcribing. Null on miss/parse failure. */
export function readTranscriptFile(file: string): { words: Word[]; text: string } | null {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(data.words)) return data;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Transcript for one source file, cached by srcHash + language only (not by
 * style config), so a component is transcribed once no matter how many times
 * legenda/overlay settings change. The hand-edited version, when saved, always
 * wins over the raw whisper output. Read by scan.ts (no transcription there —
 * only if the file already exists) and by buildMaster (transcribes on miss).
 */
export async function getTranscript(
  cfg: Config,
  srcFile: string,
  srcHash: string,
  window: { start: number; end: number }
): Promise<{ words: Word[]; text: string }> {
  const edited = readTranscriptFile(editedTranscriptPath(srcHash, cfg.whisper.language));
  if (edited) return edited;

  const file = transcriptPath(srcHash, cfg.whisper.language);
  const cached = readTranscriptFile(file);
  if (cached) return cached;

  const words = await transcribeWords(cfg, srcFile, window);
  const text = words.map((w) => w.text).join(" ").trim();
  const result = { words, text };
  try {
    fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(result), "utf8");
  } catch {
    /* best effort */
  }
  return result;
}
