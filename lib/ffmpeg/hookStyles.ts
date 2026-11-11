/**
 * Text hook styles — the same five plates used on the YouTube Shorts
 * (caixa, pincel, alerta, autoridade, objecao), ported from the Python
 * generator so the Multiplier needs no Python.
 *
 * Text rules (same as the Shorts SOP):
 *   *DESTAQUE*  lights up the key words
 *   " / " or "|" forces a line break (without it, lines balance themselves)
 * The optional "selo" is a gradient pill above the plate (series / brand name).
 *
 * Output: one transparent PNG the size of the frame (veil + plate + pill),
 * overlaid at 0,0 for the whole hook clip. Cached by content hash.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createCanvas, GlobalFonts, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import { resolveFont } from "../fonts";
import { TARJAS_DIR } from "../paths";
import type { HookStyle } from "../types";

const STYLE_VERSION = 1; // bump to invalidate cached plates after a design change
const SS = 2; // draw at 2x and downscale for smooth edges
const MAX_W = 970;
const ORANGE = "rgb(252,122,18)";
const RED: [number, number, number] = [255, 37, 0];
const AMBER: [number, number, number] = [252, 122, 18];
const WHITE = "#ffffff";
const INK = "rgb(10,10,12)";
const BLACK_FAMILY = "MultiplierHookBlack";
const XBOLD_FAMILY = "MultiplierHookExtraBold";

type Word = [string, boolean];
type Line = Word[];

// ---------------------------------------------------------------- fonts

let fontsReady: Promise<void> | null = null;
function ensureFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = (async () => {
      const xb = await resolveFont("Montserrat ExtraBold");
      const bl = await resolveFont("Montserrat Black");
      const xbFile = xb.file;
      const blFile = bl.file ?? xbFile; // Black is optional: fall back to ExtraBold
      if (!xbFile || !blFile) {
        fontsReady = null;
        throw new Error(
          "Montserrat font (ExtraBold/Black) not found. Install it in ~/Library/Fonts."
        );
      }
      GlobalFonts.registerFromPath(blFile, BLACK_FAMILY);
      GlobalFonts.registerFromPath(xbFile, XBOLD_FAMILY);
    })();
  }
  return fontsReady;
}

const fontStr = (size: number, family = BLACK_FAMILY) => `${size * SS}px ${family}`;

// one scratch context for measuring
const measureCtx = createCanvas(4, 4).getContext("2d");
function measure(text: string, font: string): number {
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
const lineWidth = (l: Line, font: string) => measure(l.map(([w]) => w).join(" "), font);

// ---------------------------------------------------------------- parsing

export function parseHook(text: string): { lines: Line[]; manual: boolean } {
  let on = false;
  const lines: Line[] = [];
  for (const raw of text.toUpperCase().split(/\s+\/\s+|\s*\|\s*/)) {
    const words: Line = [];
    for (const tok of raw.split(/\s+/).filter(Boolean)) {
      let word = "";
      let lit = false;
      for (const part of tok.split(/(\*)/)) {
        if (part === "*") on = !on;
        else if (part) {
          word += part;
          lit = lit || on;
        }
      }
      if (word) words.push([word, lit]);
    }
    if (words.length) lines.push(words);
  }
  return { lines, manual: lines.length > 1 };
}

function balance(words: Line, n: number): Line[] {
  if (n <= 1 || words.length <= 1) return [words];
  const f = fontStr(60);
  let best: Line[] = [words];
  let bestScore = Infinity;
  const walk = (start: number, left: number, acc: Line[]) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start)];
      const ws = lines.map((l) => lineWidth(l, f));
      const score = Math.max(...ws) - Math.min(...ws) + Math.max(...ws) * 0.5;
      if (score < bestScore) {
        best = lines;
        bestScore = score;
      }
      return;
    }
    for (let i = start + 1; i < words.length - left + 2; i++) {
      walk(i, left - 1, [...acc, words.slice(start, i)]);
    }
  };
  walk(0, n, []);
  return best;
}

function autoLayout(words: Line): Line[] {
  const chars = words.reduce((a, [w]) => a + w.length + 1, 0);
  return balance(words, chars <= 15 ? 1 : chars <= 40 ? 2 : 3);
}

function fit(lines: Line[], maxW: number, top = 104, low = 50): number {
  for (let size = top; size > low; size -= 2) {
    const f = fontStr(size);
    if (Math.max(...lines.map((l) => lineWidth(l, f))) <= maxW * SS) return size;
  }
  return low;
}

// ---------------------------------------------------------------- drawing helpers

function canvas(w: number, h: number): [Canvas, SKRSContext2D] {
  const c = createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  return [c, c.getContext("2d")];
}

function grad(ctx: SKRSContext2D, x0: number, x1: number) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, `rgb(${RED.join(",")})`);
  g.addColorStop(1, `rgb(${AMBER.join(",")})`);
  return g;
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

const lineH = (size: number) => Math.round(size * 1.2) * SS;

/** Baseline that vertically centres the capitals in a box (accents don't shift it). */
function textTop(font: string, y: number, boxH: number): number {
  measureCtx.font = font;
  const cap = measureCtx.measureText("H").actualBoundingBoxAscent;
  return y + (boxH + cap) / 2;
}

function drawLine(
  ctx: SKRSContext2D,
  words: Line,
  font: string,
  x: number,
  y: number,
  accent = ORANGE,
  base = WHITE
) {
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const space = ctx.measureText(" ").width;
  for (const [w, on] of words) {
    ctx.fillStyle = on ? accent : base;
    ctx.fillText(w, x, y);
    x += ctx.measureText(w).width + space;
  }
}

/** Horizontal shear, same as PIL's affine (1, k, -k*h/2): top leans right. */
function shear(src: Canvas, k: number): Canvas {
  const [c, ctx] = canvas(src.width, src.height);
  ctx.setTransform(1, 0, -k, 1, (k * src.height) / 2, 0);
  ctx.drawImage(src, 0, 0);
  return c;
}

function rotate(src: Canvas, deg: number): Canvas {
  const [c, ctx] = canvas(src.width, src.height);
  ctx.translate(src.width / 2, src.height / 2);
  ctx.rotate((-deg * Math.PI) / 180); // PIL rotates counter-clockwise
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

function cropToContent(src: Canvas): Canvas {
  const ctx = src.getContext("2d");
  const { data, width, height } = ctx.getImageData(0, 0, src.width, src.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return src;
  const [c, cx] = canvas(x1 - x0 + 1, y1 - y0 + 1);
  cx.drawImage(src, -x0, -y0);
  return c;
}

function resize(src: Canvas, w: number, h: number): Canvas {
  const [c, ctx] = canvas(w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, Math.round(w), Math.round(h));
  return c;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dry brush stroke filled with the gradient: solid core, frayed ends. */
function brush(w: number, h: number, seed: number): Canvas {
  const rnd = mulberry32(seed);
  const uni = (a: number, b: number) => a + (b - a) * rnd();
  const int = (a: number, b: number) => Math.floor(uni(a, b + 1));
  const [m, d] = canvas(w, h);
  d.fillStyle = "#fff";
  const step = 5 * SS;
  const pad = 46 * SS;
  for (let y = 0; y < h; y += step) {
    const edge = Math.abs(y / h - 0.5) * 2;
    const x0 = pad * uni(0.1, 1) + edge ** 3 * pad;
    const x1 = w - pad * uni(0.1, 1.1) - edge ** 3 * pad;
    d.fillRect(x0, y, x1 - x0, step + 1);
  }
  d.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 26; i++) {
    const y = int(0, h - 1);
    const left = rnd() < 0.5;
    const ln = int(30, 120) * SS;
    const x = int(0, 40) * SS;
    const th = int(1, 3) * SS;
    d.fillRect(left ? x : w - x - ln, y, ln, th);
  }
  // soften, then paint the gradient through the mask
  const [out, o] = canvas(w, h);
  o.filter = `blur(${1.2 * SS}px)`;
  o.drawImage(m, 0, 0);
  o.filter = "none";
  o.globalCompositeOperation = "source-in";
  o.fillStyle = grad(o, 0, w);
  o.fillRect(0, 0, w, h);
  return out;
}

/** Gradient-bordered dark panel (used by caixa and alerta). */
function borderedPanel(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number, ri: number) {
  const b = 7 * SS;
  ctx.fillStyle = grad(ctx, x, x + w);
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.fillStyle = INK;
  roundRect(ctx, x + b, y + b, w - 2 * b, h - 2 * b, ri);
  ctx.fill();
}

// ---------------------------------------------------------------- styles

function sCaixa(lines: Line[]): Canvas {
  const size = fit(lines, MAX_W - 96, 92);
  const f = fontStr(size);
  const lh = lineH(size);
  const bw = Math.max(...lines.map((l) => lineWidth(l, f)));
  const px = 54 * SS, py = 34 * SS;
  const W = Math.round(bw + 2 * px), H = lh * lines.length + 2 * py;
  const [c, ctx] = canvas(W, H);
  borderedPanel(ctx, 0, 0, W, H, 38 * SS, 32 * SS);
  ctx.font = f;
  const space = ctx.measureText(" ").width;
  lines.forEach((l, i) => {
    let x = (W - lineWidth(l, f)) / 2;
    const y = py + i * lh;
    const ty = textTop(f, y, lh);
    l.forEach(([w, on], j) => {
      ctx.font = f;
      const ww = ctx.measureText(w).width;
      if (on) {
        const nxt = j + 1 < l.length && l[j + 1][1];
        const prev = j > 0 && l[j - 1][1];
        const x0 = x - (prev ? 0 : 12 * SS);
        const x1 = x + ww + (nxt ? space : 12 * SS);
        ctx.fillStyle = grad(ctx, x0, x1);
        roundRect(ctx, x0, y + 2 * SS, x1 - x0, lh - 4 * SS, nxt || prev ? 6 * SS : 12 * SS);
        ctx.fill();
      }
      ctx.fillStyle = WHITE;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(w, x, ty);
      x += ww + space;
    });
  });
  return c;
}

function sPincel(lines: Line[], seed = 7): Canvas {
  if (lines.length === 1 && lines[0].length > 1) lines = balance(lines[0], 2);
  const size = fit(lines, MAX_W - 90, 98);
  const f = fontStr(size);
  const lh = lineH(size);
  const bw = Math.max(...lines.map((l) => lineWidth(l, f)));
  const W = Math.round(bw + 170 * SS);
  const head = Math.round(lh * 1.34);
  const rest = Math.round(lh * 1.08) * (lines.length - 1);
  const H = head + rest + 10 * SS;
  const [c, ctx] = canvas(W, H);
  const w0 = Math.round(lineWidth(lines[0], f) + 150 * SS);
  ctx.drawImage(brush(w0, head, seed), Math.floor((W - w0) / 2), 0);
  drawLine(ctx, lines[0].map(([w]) => [w, false] as Word), f, (W - lineWidth(lines[0], f)) / 2, textTop(f, 0, head));
  let y = head + 4 * SS;
  for (const l of lines.slice(1)) {
    const lw = lineWidth(l, f);
    const bh = Math.round(lh * 1.04);
    ctx.fillStyle = INK;
    ctx.fillRect((W - lw) / 2 - 22 * SS, y, lw + 44 * SS, bh);
    drawLine(ctx, l, f, (W - lw) / 2, textTop(f, y, bh));
    y += bh + 2 * SS;
  }
  const [big, b] = canvas(W + 80 * SS, H + 80 * SS);
  b.drawImage(c, 40 * SS, 40 * SS);
  return rotate(big, 2.2);
}

function triangle(s: number): Canvas {
  const [c, ctx] = canvas(s, s);
  const t = Math.round(s * 0.09);
  const pts: [number, number][] = [[s / 2, t * 1.4], [s - t, s - t * 1.4], [t, s - t * 1.4]];
  ctx.strokeStyle = ORANGE;
  ctx.fillStyle = ORANGE;
  ctx.lineWidth = t;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  ctx.lineTo(...pts[1]);
  ctx.lineTo(...pts[2]);
  ctx.closePath();
  ctx.stroke();
  const bx = s / 2;
  roundRect(ctx, bx - t * 0.62, s * 0.38, t * 1.24, s * 0.3, t * 0.6);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(bx, s * 0.73 + t * 0.72, t * 0.72, t * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function sAlerta(lines: Line[]): Canvas {
  if (!lines.some((l) => l.some(([, on]) => on))) {
    // no accent marked: the last line lights up
    lines = [...lines.slice(0, -1), lines[lines.length - 1].map(([w]) => [w, true] as Word)];
  }
  const icon = 124;
  const size = fit(lines, MAX_W - icon - 96, 92);
  const f = fontStr(size);
  const lh = lineH(size);
  const bw = Math.max(...lines.map((l) => lineWidth(l, f)));
  const ic = (lines.length > 1 ? icon : 110) * SS;
  const px = 30 * SS, py = 30 * SS, gap = 24 * SS;
  const W = Math.round(bw + ic + gap + 2 * px) + 60 * SS;
  const H = Math.max(lh * lines.length + 2 * py, ic + 2 * py);
  const [c, ctx] = canvas(W, H);
  const m0 = 30 * SS;
  borderedPanel(ctx, m0, 0, W - 2 * m0, H, 26 * SS, 20 * SS);
  ctx.drawImage(triangle(ic), m0 + px, Math.floor((H - ic) / 2));
  const x = m0 + px + ic + gap;
  const y0 = (H - lh * lines.length) / 2;
  lines.forEach((l, i) => drawLine(ctx, l, f, x, textTop(f, y0 + i * lh, lh)));
  return shear(c, 0.13);
}

/** Pull the accented run onto its own line so it gets the bar. */
function accentLines(lines: Line[]): Line[] {
  const flat = lines.flat();
  const idx = flat.map(([, on], i) => (on ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return lines;
  const a = idx[0], b = idx[idx.length - 1] + 1;
  return [flat.slice(0, a), flat.slice(a, b), flat.slice(b)].filter((p) => p.length);
}

function sAutoridade(lines: Line[]): Canvas {
  lines = accentLines(lines);
  const size = fit(lines, MAX_W - 150, 92);
  const f = fontStr(size);
  const lh = lineH(size);
  const bw = Math.max(...lines.map((l) => lineWidth(l, f)));
  const mx = 40 * SS, my = 66 * SS;
  const W = Math.round(bw + 2 * mx + 110 * SS);
  const H = lh * lines.length + 2 * my + 26 * SS;
  const [c, ctx] = canvas(W, H);
  let y = my;
  for (const l of lines) {
    const lw = lineWidth(l, f);
    const x = (W - lw) / 2;
    const on = l.some(([, o]) => o);
    const hh = lh + (on ? 14 * SS : 0);
    if (on) {
      const barW = Math.round(lw + 58 * SS);
      const [pad, p] = canvas(barW + 40 * SS, hh);
      p.fillStyle = grad(p, 20 * SS, 20 * SS + barW);
      p.fillRect(20 * SS, 0, barW, hh);
      ctx.drawImage(shear(pad, 0.16), Math.round(x - 49 * SS), Math.round(y));
    }
    drawLine(ctx, l.map(([w]) => [w, false] as Word), f, x, textTop(f, y, hh));
    y += hh;
  }
  ctx.font = fontStr(250);
  ctx.fillStyle = ORANGE;
  // PIL anchors "lt"/"rb" = ascender / descender lines; place by baseline to match
  ctx.textBaseline = "alphabetic";
  // PIL's "lt" anchor sits 0.742 em above the baseline for this glyph; "rb" is the baseline
  ctx.textAlign = "left";
  ctx.fillText("“", 6 * SS, -20 * SS + 0.742 * 250 * SS);
  ctx.textAlign = "right";
  ctx.fillText("”", W - 6 * SS, H + 92 * SS);
  return c;
}

function sObjecao(lines: Line[]): Canvas {
  const size = fit(lines, MAX_W - 130, 100);
  const f = fontStr(size);
  const lh = lineH(size);
  const bw = Math.max(...lines.map((l) => lineWidth(l, f)));
  const px = 62 * SS, py = 42 * SS;
  const W = Math.round(bw + 2 * px), H = lh * lines.length + 2 * py + 14 * SS;
  const [c, ctx] = canvas(W, H);
  const t = 11 * SS, ln = 84 * SS;
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = t;
  ctx.lineJoin = "round";
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {
    const x = cx + (sx * t) / 2, y = cy + (sy * t) / 2;
    ctx.beginPath();
    ctx.moveTo(x + sx * ln, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * ln);
    ctx.stroke();
  }
  ctx.font = f;
  const space = ctx.measureText(" ").width;
  const y0 = py + 4 * SS;
  lines.forEach((l, i) => {
    let x = (W - lineWidth(l, f)) / 2;
    const ty = textTop(f, y0 + i * lh, lh);
    l.forEach(([w, on], j) => {
      ctx.font = f;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      const ww = ctx.measureText(w).width;
      ctx.fillStyle = on ? ORANGE : WHITE;
      ctx.fillText(w, x, ty);
      if (on) {
        const uy = ty + 8 * SS;
        const ext = j + 1 < l.length && l[j + 1][1] ? space : 0;
        roundRect(ctx, x, uy, ww + ext, 9 * SS, 4 * SS);
        ctx.fill();
      }
      x += ww + space;
    });
  });
  return c;
}

const STYLE_FN: Record<HookStyle, (l: Line[]) => Canvas> = {
  caixa: sCaixa,
  pincel: (l) => sPincel(l),
  alerta: sAlerta,
  autoridade: sAutoridade,
  objecao: sObjecao,
};

function pill(text: string): Canvas {
  const f = fontStr(32, XBOLD_FAMILY);
  const w = Math.round(measure(text, f)) + 56 * SS;
  const h = 60 * SS;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = grad(ctx, 0, w);
  roundRect(ctx, 0, 0, w, h, h / 2);
  ctx.fill();
  ctx.font = f;
  ctx.fillStyle = WHITE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
  return c;
}

/** Dark band behind the plate, fading smoothly up and down. */
function drawVeil(ctx: SKRSContext2D, W: number, H: number, top: number, bottom: number) {
  const smooth = (y: number, a: number, b: number) => {
    const t = Math.min(1, Math.max(0, (y - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const a = smooth(y, top - 190, top - 10) * (1 - smooth(y, bottom + 10, bottom + 190));
    if (a <= 0) continue;
    const alpha = Math.round(a * 255);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      img.data[i] = 6;
      img.data[i + 1] = 6;
      img.data[i + 2] = 8;
      img.data[i + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- public API

export interface HookRenderOpts {
  texto: string;
  estilo: HookStyle;
  selo?: string;
  posicao: number; // 0-1 vertical centre of the plate
  width: number;
  height: number;
}

/** Full-frame RGBA layer: veil + plate + optional pill. */
export async function renderHookLayer(o: HookRenderOpts): Promise<Buffer> {
  await ensureFonts();
  const { width: W, height: H } = o;
  const parsed = parseHook(o.texto);
  if (!parsed.lines.length) throw new Error("Hook text is empty.");
  const lines = parsed.manual ? parsed.lines : autoLayout(parsed.lines[0]);
  let block = cropToContent(STYLE_FN[o.estilo](lines));
  block = resize(block, block.width / SS, block.height / SS);
  if (block.width > W - 40) {
    block = resize(block, W - 40, (block.height * (W - 40)) / block.width);
  }
  const centerY = Math.round(H * Math.min(0.95, Math.max(0.05, o.posicao)));
  let top = centerY - Math.floor(block.height / 2);
  const label = (o.selo ?? "").trim().toUpperCase();
  let tag: Canvas | null = null;
  if (label) {
    const big = pill(label);
    tag = resize(big, big.width / SS, big.height / SS);
    top += Math.floor(tag.height / 2) + 4;
  }
  const bottom = top + block.height;
  const head = top - (tag ? tag.height + 16 : 0);
  const [c, ctx] = canvas(W, H);
  drawVeil(ctx, W, H, Math.min(head, centerY - 80), Math.max(bottom, centerY + 76));
  ctx.drawImage(block, Math.floor((W - block.width) / 2), top);
  if (tag) ctx.drawImage(tag, Math.floor((W - tag.width) / 2), head);
  return c.toBuffer("image/png");
}

/** Cached PNG on disk for the render pipeline. */
export async function buildHookPng(o: HookRenderOpts): Promise<string> {
  const key = crypto
    .createHash("sha256")
    .update(JSON.stringify({ v: STYLE_VERSION, ...o, texto: o.texto.trim(), selo: (o.selo ?? "").trim() }))
    .digest("hex")
    .slice(0, 20);
  fs.mkdirSync(TARJAS_DIR, { recursive: true });
  const out = path.join(TARJAS_DIR, `hook-${key}.png`);
  if (!fs.existsSync(out)) {
    const buf = await renderHookLayer(o);
    const tmp = `${out}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, out);
  }
  return out;
}
