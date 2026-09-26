import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { loadComponentsCsv, scanComponents } from "@/lib/scan";
import { kindDir } from "@/lib/paths";
import type { ComponentKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PREFIX: Record<ComponentKind, string> = { hook: "H", body: "B", cta: "C" };

/** Next free numeric index for a kind, scanning existing files. */
function nextIndex(dir: string, prefix: string): number {
  let max = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      const m = new RegExp(`^${prefix}(\\d+)`, "i").exec(f);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  } catch {
    /* dir may not exist yet */
  }
  return max + 1;
}

/**
 * Duplicate a component: copy its source clip to a new indexed filename in the
 * same kind folder, so the copy survives a rescan and gets its own id. Lets the
 * user spin off variations (different overlay/split) from one clip.
 */
export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    const cfg = loadConfig();
    const rows = loadComponentsCsv();
    const row = rows.find((r) => r.id === id);
    if (!row) return NextResponse.json({ error: "component not found" }, { status: 404 });

    const dir = kindDir(cfg, row.tipo);
    const src = path.join(dir, row.arquivo);
    if (!fs.existsSync(src)) {
      return NextResponse.json({ error: "original file missing" }, { status: 404 });
    }

    const prefix = PREFIX[row.tipo];
    const idx = nextIndex(dir, prefix);
    const ext = path.extname(row.arquivo);
    const stem = path.basename(row.arquivo, ext).replace(/^[HBC]\d+[_-]?/i, "");
    const outName = `${prefix}${String(idx).padStart(2, "0")}_${stem || "copy"}-copy${ext}`;
    const dest = path.join(dir, outName);

    fs.copyFileSync(src, dest);
    await scanComponents(cfg); // refresh csv + thumbs so the copy shows up

    return NextResponse.json({ saved: outName });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
