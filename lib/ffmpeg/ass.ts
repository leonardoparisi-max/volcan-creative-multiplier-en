import fs from "node:fs";
import path from "node:path";
import { SUBS_DIR } from "../paths";
import { cssColorToAss } from "../escape";
import type { Config, Word } from "../types";

function assTime(t: number): string {
  if (t < 0) t = 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.round((t - Math.floor(t)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(
    cs
  ).padStart(2, "0")}`;
}

/**
 * 9:16 safe zone (Reels / TikTok / Shorts): the platform UI covers roughly the
 * top 14 %, the bottom 22 % and a 12 % column on the right (icons, 50–85 % of
 * the height). Text keeps 12 % of the width free on BOTH sides so centred lines
 * never touch the icon column.
 */
export const SAFE_ZONE = { top: 0.14, bottom: 0.22, right: 0.12, sideMargin: 0.12 };

export function safeMarginX(width: number): number {
  return Math.round(width * SAFE_ZONE.sideMargin);
}

/** ASS escapes for user text: braces are tag delimiters, "|" is a line break. */
function assText(raw: string): string {
  return raw
    .replace(/[{}]/g, "")
    .replace(/\\/g, "")
    .split("|")
    .map((l) => l.trim())
    .join("\\N");
}

/**
 * Static on-screen text ("simples" style) for the whole component, rendered by
 * libass instead of drawtext so it WRAPS inside the safe width, supports any
 * character, and shares the font resolution with the captions.
 */
export function buildOverlayAss(
  cfg: Config,
  key: string,
  rawText: string,
  yFrac: number | undefined,
  durationSec: number
): string {
  const O = cfg.overlay_hook;
  const W = cfg.video.width;
  const H = cfg.video.height;
  const fill = cssColorToAss(O.cor);
  const border = cssColorToAss(O.contorno_cor);
  const box = cssColorToAss(O.fundo_cor);
  const margin = safeMarginX(W);
  const y = Math.round(H * (yFrac ?? O.posicao_vertical));
  // \an4/5/6 = middle-left / middle-centre / middle-right anchors
  const an = O.alinhamento === "left" ? 4 : O.alinhamento === "right" ? 6 : 5;
  const x = O.alinhamento === "left" ? margin : O.alinhamento === "right" ? W - margin : Math.round(W / 2);
  // BorderStyle 3 = opaque box behind the text (BackColour), 1 = outline only
  const borderStyle = O.fundo_caixa ? 3 : 1;
  const outlineW = O.fundo_caixa ? Math.max(12, O.contorno_largura) : O.contorno_largura;

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Ov,${O.fonte},${O.tamanho},${fill},${fill},${border},${box},-1,0,0,0,100,100,0,0,${borderStyle},${outlineW},0,${an},${margin},${margin},40,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 0,${assTime(0)},${assTime(Math.max(0.1, durationSec + 1))},Ov,,0,0,0,,{\\an${an}\\pos(${x},${y})}${assText(rawText)}`,
  ].join("\n");

  fs.mkdirSync(SUBS_DIR, { recursive: true });
  const outPath = path.join(SUBS_DIR, `${key}_ov.ass`);
  fs.writeFileSync(outPath, header + "\n", "utf8");
  return outPath;
}

/**
 * Group words into caption lines of up to maxPerLine words, and always break
 * after sentence punctuation so a line never reads "isso? O que".
 */
function groupLines(words: Word[], maxPerLine: number): Word[][] {
  const lines: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    const endsSentence = /[.!?…]["»)]?$/.test(w.text);
    if (cur.length >= maxPerLine || endsSentence) {
      lines.push(cur);
      cur = [];
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/**
 * Build a karaoke-per-word .ass. For each word we emit one Dialogue event that
 * shows the whole line with the active word recolored to `cor_destaque` and the
 * rest in `cor`. The event spans from the word's start until the next word in
 * the line begins, so the caption stays on screen with a moving highlight.
 *
 * Cached by `hash` (source file hash) so a hook is transcribed + styled once.
 * Returns the absolute .ass path, or null if there are no words.
 */
export function buildAss(
  cfg: Config,
  hash: string,
  words: Word[]
): string | null {
  // whisper emits empty tokens and occasionally two words with the same start;
  // drop the former and merge the latter (otherwise duplicate/blank events).
  const cleaned: Word[] = [];
  for (const w of words) {
    const t = w.text.trim();
    if (!t) continue;
    const prev = cleaned[cleaned.length - 1];
    if (prev && Math.abs(prev.start - w.start) < 0.005) {
      prev.text = `${prev.text} ${t}`;
      prev.end = Math.max(prev.end, w.end);
    } else {
      cleaned.push({ start: w.start, end: w.end, text: t });
    }
  }
  words = cleaned;
  if (!words.length) return null;
  const outPath = path.join(SUBS_DIR, `${hash}.ass`);

  const L = cfg.legenda;
  const W = cfg.video.width;
  const H = cfg.video.height;
  const primary = cssColorToAss(L.cor);
  const highlight = cssColorToAss(L.cor_destaque);
  const outline = cssColorToAss(L.contorno_cor);
  const posY = Math.round(H * L.posicao_vertical);
  const posX = Math.round(W / 2);
  const margin = safeMarginX(W);

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0", // smart wrap inside the margins (never overflow the frame)
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Alignment 5 = middle-center; we place with \pos so MarginV is irrelevant.
    // MarginL/R define the wrap width = the 9:16 safe width (see safeMarginX).
    `Style: Cap,${L.fonte},${L.tamanho},${primary},${highlight},${outline},&H64000000,-1,0,0,0,100,100,0,0,1,${L.contorno_largura},${L.sombra},5,${margin},${margin},40,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const events: string[] = [];
  const lines = groupLines(words, Math.max(1, L.max_palavras_linha));

  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const w = line[i];
      const start = w.start;
      // stay visible until the next word in this line starts (moving highlight)
      const end = i + 1 < line.length ? line[i + 1].start : w.end;
      const rendered = line
        .map((word, j) => {
          const t = word.text.replace(/[{}]/g, "");
          return j === i
            ? `{\\c${highlight}}${t}{\\c${primary}}`
            : t;
        })
        .join(" ");
      const tag = `{\\an5\\pos(${posX},${posY})}`;
      events.push(
        `Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,${tag}${rendered}`
      );
    }
  }

  fs.writeFileSync(outPath, header + "\n" + events.join("\n") + "\n", "utf8");
  return outPath;
}
