import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { loadComponentsCsv, scanComponents, writeComponentsCsv } from "@/lib/scan";
import { kindDir, inputDir } from "@/lib/paths";
import type { ComponentRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function findRow(id: string) {
  return loadComponentsCsv().find((r) => r.id === id);
}

// PATCH { nome } → rename the file, keeping the id's prefix (H01_ etc).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { nome } = (await req.json()) as { nome?: string };
    const cfg = loadConfig();
    const row = findRow(params.id);
    if (!row) return NextResponse.json({ error: "component not found" }, { status: 404 });

    const dir = kindDir(cfg, row.tipo);
    const src = path.join(dir, row.arquivo);
    if (!fs.existsSync(src)) {
      return NextResponse.json({ error: "original file missing" }, { status: 404 });
    }
    const ext = path.extname(row.arquivo);
    const clean = slug(nome || "") || "clip";
    const newFilename = `${row.id}_${clean}${ext}`;
    const dest = path.join(dir, newFilename);
    if (dest !== src) {
      if (fs.existsSync(dest)) {
        return NextResponse.json({ error: "a file with that name already exists" }, { status: 409 });
      }
      fs.renameSync(src, dest);
    }
    await scanComponents(cfg); // refresh components.csv + thumb refs
    return NextResponse.json({ ok: true, arquivo: newFilename });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

/**
 * Remove a text-variant row (H01a etc): CSV-only, the file belongs to the base
 * hook and is never touched. If this was the last-but-one variant, fold the
 * remaining variant's text/style back into the base and drop both suffixed
 * rows — so a hook always reads either as one plain row, or as ≥2 variants.
 */
function removeVariant(id: string, baseId: string): void {
  const rows = loadComponentsCsv();
  const siblings = rows.filter((r) => r.variante_de === baseId && r.id !== id);
  let out: ComponentRow[];
  if (siblings.length === 1) {
    const last = siblings[0];
    out = rows
      .filter((r) => r.id !== id && r.id !== last.id)
      .map((r) =>
        r.id === baseId
          ? {
              ...r,
              texto_overlay: last.texto_overlay,
              texto_estilo: last.texto_estilo,
              texto_posicao: last.texto_posicao,
              legenda_ativa: last.legenda_ativa,
              layout: last.layout,
              imagem: last.imagem,
              split_mudo: last.split_mudo,
              divisao: last.divisao,
              foco_video: last.foco_video,
              foco_imagem: last.foco_imagem,
              punch_in: last.punch_in,
              ativo: true,
            }
          : r
      );
  } else {
    out = rows.filter((r) => r.id !== id);
  }
  writeComponentsCsv(out);
}

// DELETE → for a text variant, a CSV-only removal (see removeVariant); for a
// real component, moves the file to input/_lixeira/<kind>/ (never a hard delete).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cfg = loadConfig();
    const row = findRow(params.id);
    if (!row) return NextResponse.json({ error: "component not found" }, { status: 404 });

    if (row.variante_de) {
      removeVariant(row.id, row.variante_de);
      await scanComponents(cfg);
      return NextResponse.json({ ok: true });
    }

    const dir = kindDir(cfg, row.tipo);
    const src = path.join(dir, row.arquivo);
    const trashDir = path.join(inputDir(cfg), "_lixeira", path.basename(dir));
    fs.mkdirSync(trashDir, { recursive: true });

    if (fs.existsSync(src)) {
      let dest = path.join(trashDir, row.arquivo);
      let bump = 1;
      while (fs.existsSync(dest)) {
        const ext = path.extname(row.arquivo);
        const stem = path.basename(row.arquivo, ext);
        dest = path.join(trashDir, `${stem}-${bump++}${ext}`);
      }
      fs.renameSync(src, dest);
    }
    await scanComponents(cfg);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
