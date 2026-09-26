import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { run } from "./exec";
import { resolveFont } from "../fonts";
import { escapeFilterPath, cssColorToFf } from "../escape";
import { TARJAS_DIR } from "../paths";
import type { Config } from "../types";

export interface TarjaResult {
  path: string;
  width: number;
  height: number;
}

function lineBoxHeight(cfg: Config): number {
  return cfg.tarja.tamanho * 1.22 + cfg.tarja.espaco_linha;
}

/**
 * Size of the bar, derived from the text so it always hugs the copy:
 * one line-box per line plus symmetric padding. Kept even for yuv420p safety.
 */
export function tarjaSize(
  cfg: Config,
  texto: string
): { width: number; height: number } {
  const lines = Math.max(1, texto.split("|").length);
  const raw =
    lines * lineBoxHeight(cfg) -
    cfg.tarja.espaco_linha +
    cfg.tarja.padding_vertical * 2;
  const height = Math.max(2, Math.round(raw / 2) * 2);
  const width =
    Math.round((cfg.video.width * Math.min(1, Math.max(0.2, cfg.tarja.largura))) / 2) *
    2;
  return { width, height };
}

/**
 * Render the gradient bar with its text baked in, once, to a cached PNG.
 *
 * Baking the text here (rather than drawing it in the main filtergraph) keeps
 * the render chain simple and means accents, quotes and line breaks are handled
 * in one isolated place. The copy is passed through a sidecar file so no user
 * text ever reaches the filtergraph parser.
 */
export async function buildTarja(
  cfg: Config,
  texto: string
): Promise<TarjaResult | null> {
  const clean = texto.trim();
  if (!clean) return null;

  const { width, height } = tarjaSize(cfg, clean);
  const key = crypto
    .createHash("sha256")
    .update(JSON.stringify({ clean, t: cfg.tarja, w: cfg.video.width }))
    .digest("hex")
    .slice(0, 20);

  const outPath = path.join(TARJAS_DIR, `${key}.png`);
  if (fs.existsSync(outPath)) return { path: outPath, width, height };

  const font = await resolveFont(cfg.tarja.fonte);
  if (!font.file) {
    throw new Error(
      `Bar font not found: ${cfg.tarja.fonte}. Install it in ~/Library/Fonts.`
    );
  }

  // Text goes to a sidecar file: no escaping of the user's copy required.
  const txtPath = path.join(TARJAS_DIR, `${key}.txt`);
  fs.writeFileSync(txtPath, clean.split("|").map((l) => l.trim()).join("\n"), "utf8");

  const start = cssColorToFf(cfg.tarja.cor_inicio);
  const end = cssColorToFf(cfg.tarja.cor_fim);
  const fill = cssColorToFf(cfg.tarja.cor_texto);
  const shadow = cssColorToFf(cfg.tarja.sombra_cor);
  const border = cssColorToFf(cfg.tarja.contorno_cor);

  const draw = [
    `fontfile='${escapeFilterPath(font.file)}'`,
    `textfile='${escapeFilterPath(txtPath)}'`,
    `expansion=none`, // literal text: no %{...} expansion, so % is safe
    `fontsize=${cfg.tarja.tamanho}`,
    `fontcolor=${fill.color}@${fill.alpha}`,
    `x=(w-text_w)/2`,
    `y=(h-text_h)/2`,
    `text_align=center`,
    `line_spacing=${cfg.tarja.espaco_linha}`,
  ];
  if (cfg.tarja.sombra_offset > 0) {
    draw.push(
      `shadowcolor=${shadow.color}@${shadow.alpha}`,
      `shadowx=${cfg.tarja.sombra_offset}`,
      `shadowy=${cfg.tarja.sombra_offset + 1}`
    );
  }
  if (cfg.tarja.contorno_largura > 0) {
    draw.push(
      `borderw=${cfg.tarja.contorno_largura}`,
      `bordercolor=${border.color}@${border.alpha}`
    );
  }

  await run(cfg.bin.ffmpeg, [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `gradients=s=${width}x${height}:c0=${start.color}:c1=${end.color}` +
      `:x0=0:y0=0:x1=${width}:y1=0:type=linear:speed=0:d=1`,
    "-frames:v",
    "1",
    "-vf",
    `drawtext=${draw.join(":")}`,
    outPath,
  ]);

  return { path: outPath, width, height };
}
