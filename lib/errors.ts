// ---------------------------------------------------------------------------
// Translates the raw errors this pipeline actually throws (ffmpeg stderr,
// Node ENOENT, our own messages) into short sentences an editor with no
// technical background can act on. Falls through to the raw text when no
// pattern matches — never hides an error, just relabels the ones we know.
// ---------------------------------------------------------------------------

interface Pattern {
  test: RegExp;
  say: (m: RegExpMatchArray) => string;
}

const PATTERNS: Pattern[] = [
  {
    test: /(?:Text font|Bar font) not found: (.+?)\./i,
    say: (m) =>
      `Font ${m[1]} not installed — copy the font's .ttf file to ~/Library/Fonts and reload the page.`,
  },
  {
    test: /No such filter:? ?'?drawtext'?/i,
    say: () =>
      `The installed ffmpeg is missing the text filter (drawtext) — reinstall with "brew install homebrew-ffmpeg/ffmpeg/ffmpeg".`,
  },
  {
    test: /No such filter:? ?'?subtitles'?/i,
    say: () =>
      `The installed ffmpeg is missing the caption filter (subtitles) — reinstall with "brew install homebrew-ffmpeg/ffmpeg/ffmpeg".`,
  },
  {
    test: /moov atom not found/i,
    say: () =>
      `This video file is corrupted or incomplete (probably a copy that stopped halfway) — copy the clip again.`,
  },
  {
    test: /Invalid data found when processing input/i,
    say: () =>
      `This file isn't a valid video, or the format isn't supported — check that it's actually a video clip.`,
  },
  {
    test: /No space left on device/i,
    say: () =>
      `No free disk space — free up space (or clear cache/outputs in Settings) and try again.`,
  },
  {
    test: /whisper.*(ENOENT|not found|no such file)/i,
    say: () => `The transcription program (whisper-cli) isn't installed — run "brew install whisper-cpp".`,
  },
  {
    test: /ffmpeg.*(ENOENT|not found|no such file)/i,
    say: () => `ffmpeg isn't installed, or the path in Settings → Advanced is wrong.`,
  },
  {
    test: /missing master\(s\)|master\(s\) ausente\(s\)/i,
    say: () =>
      `One of the clips in this combination wasn't prepared (ingestion failed earlier) — check the Components list for the item with an error, fix it and render again.`,
  },
  {
    test: /mismatched audio and video lengths|áudio e vídeo de tamanhos diferentes/i,
    say: () =>
      `This clip's audio and video came out with different lengths — try rendering again; if it keeps happening, the original file may have a problem.`,
  },
];

/** Human sentence for a raw error string. Returns the original text on no match. */
export function humanize(err: string | undefined | null): string {
  const raw = (err || "").trim();
  if (!raw) return "";
  for (const p of PATTERNS) {
    const m = raw.match(p.test);
    if (m) return p.say(m);
  }
  return raw;
}
