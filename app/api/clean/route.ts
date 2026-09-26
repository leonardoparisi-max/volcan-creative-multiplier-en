import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import {
  NORMALIZED_DIR,
  SUBS_DIR,
  PROBE_DIR,
  THUMBS_DIR,
  TARJAS_DIR,
  outputDir,
} from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function dirSizeMb(dir: string): number {
  let bytes = 0;
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        try {
          bytes += fs.statSync(full).size;
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(dir);
  return bytes / (1024 * 1024);
}

/** Empty a directory's contents but keep the directory itself. */
function emptyDir(dir: string): number {
  const freed = dirSizeMb(dir);
  try {
    for (const name of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    }
  } catch {
    /* dir may not exist */
  }
  return freed;
}

/**
 * Free disk: "cache" wipes normalized masters, thumbs, subs, probes, tarjas
 * (all regenerated on the next render). "output" wipes every rendered batch.
 * Never touches the user's original clips in input/.
 */
export async function POST(req: NextRequest) {
  try {
    const { target } = await req.json();
    const cfg = loadConfig();
    let freed = 0;

    if (target === "cache" || target === "all") {
      for (const d of [NORMALIZED_DIR, SUBS_DIR, PROBE_DIR, THUMBS_DIR, TARJAS_DIR]) {
        freed += emptyDir(d);
      }
    }
    if (target === "output" || target === "all") {
      freed += emptyDir(outputDir(cfg));
    }
    if (!["cache", "output", "all"].includes(target)) {
      return NextResponse.json({ error: "invalid target" }, { status: 400 });
    }

    return NextResponse.json({ freedMb: +freed.toFixed(1) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
