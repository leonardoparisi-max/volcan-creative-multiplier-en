import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { outputDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ok/erro/pulado counts for a batch — status.json (live/last job) first, manifest.json as fallback. */
function readCounts(dir: string): { ok: number; erro: number; pulado: number } {
  try {
    const status = JSON.parse(fs.readFileSync(path.join(dir, "status.json"), "utf8"));
    return { ok: status.done ?? 0, erro: status.failed ?? 0, pulado: status.skipped ?? 0 };
  } catch {
    /* fall through to manifest.json */
  }
  const counts = { ok: 0, erro: 0, pulado: 0 };
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    for (const a of manifest.arquivos ?? []) {
      if (a.status === "ok") counts.ok++;
      else if (a.status === "erro") counts.erro++;
      else if (a.status === "pulado") counts.pulado++;
    }
  } catch {
    /* no manifest.json either — leave zeros */
  }
  return counts;
}

// List rendered batches / levas (newest first) with counts and total size.
export async function GET() {
  const cfg = loadConfig();
  const out = outputDir(cfg);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(out, { withFileTypes: true });
  } catch {
    return NextResponse.json({ batches: [] });
  }
  const batches = entries
    .filter((e) => e.isDirectory() && e.name !== "_preview")
    .map((e) => {
      const name = e.name;
      const dir = path.join(out, name);
      let files: string[] = [];
      try {
        files = fs.readdirSync(dir);
      } catch {
        /* ignore */
      }
      const mp4 = files.filter((f) => f.endsWith(".mp4"));
      let sizeMb = 0;
      for (const f of mp4) {
        try {
          sizeMb += fs.statSync(path.join(dir, f)).size / (1024 * 1024);
        } catch {
          /* ignore */
        }
      }
      let mtime = 0;
      try {
        mtime = fs.statSync(dir).mtimeMs;
      } catch {
        /* ignore */
      }
      return {
        name,
        leva: name,
        count: mp4.length,
        sizeMb: +sizeMb.toFixed(1),
        hasManifest: files.includes("manifest.csv"),
        ...readCounts(dir),
        mtime,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  return NextResponse.json({ batches });
}

// DELETE ?name= → remove a batch/leva folder entirely (with everything in it).
export async function DELETE(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") || "";
  if (!name || name === "_preview" || !/^[\w.\-]+$/.test(name)) {
    return NextResponse.json({ error: "invalid batch name" }, { status: 400 });
  }
  const cfg = loadConfig();
  const out = path.resolve(outputDir(cfg));
  const dir = path.resolve(out, name);
  if (dir !== path.join(out, name) || !dir.startsWith(out + path.sep)) {
    return NextResponse.json({ error: "path outside output/" }, { status: 400 });
  }
  if (!fs.existsSync(dir)) {
    return NextResponse.json({ error: "batch not found" }, { status: 404 });
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return NextResponse.json({ ok: true });
}
