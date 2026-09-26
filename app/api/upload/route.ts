import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { kindDir, imagesDir, ensureDirs } from "@/lib/paths";
import { humanize } from "@/lib/errors";
import type { ComponentKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const PREFIX: Record<ComponentKind, string> = { hook: "H", body: "B", cta: "C" };
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

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
 * Copy uploaded files into input/<kind> (or input/imagens). The OS file dialog
 * lets the user pick from anywhere, including a Google Drive Desktop folder,
 * which appears as a normal folder. Each clip gets an auto ID prefix (H07_…) if
 * it doesn't already start with one.
 */
export async function POST(req: NextRequest) {
  try {
    const cfg = loadConfig();
    ensureDirs(cfg);
    const form = await req.formData();
    const kind = String(form.get("kind") || "");
    const isImage = kind === "image";
    const target = isImage ? imagesDir(cfg) : kindDir(cfg, kind as ComponentKind);
    if (!isImage && !["hook", "body", "cta"].includes(kind)) {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }
    fs.mkdirSync(target, { recursive: true });

    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) {
      return NextResponse.json({ error: "no file" }, { status: 400 });
    }

    // split-media pool accepts BOTH images and videos; kind clips accept video
    const allowed = isImage ? new Set([...IMAGE_EXT, ...VIDEO_EXT]) : VIDEO_EXT;
    const prefix = isImage ? "" : PREFIX[kind as ComponentKind];
    let idx = isImage ? 0 : nextIndex(target, prefix);
    const saved: string[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (!allowed.has(ext)) {
        skipped.push(`${file.name} (format)`);
        continue;
      }
      // path.basename's suffix match is case-sensitive; strip using the
      // filename's own (unlowercased) extension so "IMG_5568.MOV" doesn't
      // keep its ".MOV" and end up as "...mov.mov" after we append `ext`.
      const rawExt = path.extname(file.name);
      const base = slug(path.basename(file.name, rawExt)) || "clip";
      let outName: string;
      if (isImage) {
        outName = `${base}${ext}`;
      } else {
        // keep an existing valid prefix, otherwise assign the next id
        const hasPrefix = new RegExp(`^${prefix}\\d+`, "i").test(file.name);
        outName = hasPrefix
          ? `${base}${ext}`
          : `${prefix}${String(idx++).padStart(2, "0")}_${base}${ext}`;
      }
      let dest = path.join(target, outName);
      // avoid clobbering
      let bump = 1;
      while (fs.existsSync(dest)) {
        const stem = path.basename(outName, ext);
        dest = path.join(target, `${stem}-${bump++}${ext}`);
      }
      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(dest, buf);
      saved.push(path.basename(dest));
    }

    return NextResponse.json({ saved, skipped });
  } catch (e: any) {
    const raw = e?.message || String(e);
    return NextResponse.json({ error: humanize(raw), detalhe: raw }, { status: 500 });
  }
}
