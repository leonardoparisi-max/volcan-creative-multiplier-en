import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { run } from "@/lib/ffmpeg/exec";
import { loadConfig } from "@/lib/config";
import { THUMBS_DIR, outputDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(file: string): Promise<NextResponse> {
  const buf = fs.readFileSync(file);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-cache",
    },
  });
}

// ?hash= → thumb of an input component (existing behaviour, cached at scan time).
// ?batch=&file= → thumb of a rendered output file, generated on demand and cached.
export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash") || "";
  const batch = req.nextUrl.searchParams.get("batch") || "";
  const file = req.nextUrl.searchParams.get("file") || "";

  if (batch || file) {
    if (!/^[\w.\-]+$/.test(batch) || !/^[\w.\-]+\.mp4$/i.test(file)) {
      return new NextResponse("bad batch/file", { status: 400 });
    }
    const cfg = loadConfig();
    const out = path.resolve(outputDir(cfg));
    const src = path.resolve(out, batch, file);
    if (!src.startsWith(out + path.sep) || !fs.existsSync(src)) {
      return new NextResponse("not found", { status: 404 });
    }
    const key = crypto.createHash("sha256").update(`${batch}/${file}`).digest("hex").slice(0, 20);
    const thumb = path.join(THUMBS_DIR, `out_${key}.jpg`);
    if (!fs.existsSync(thumb)) {
      fs.mkdirSync(THUMBS_DIR, { recursive: true });
      await run(
        cfg.bin.ffmpeg,
        ["-hide_banner", "-y", "-ss", "0.3", "-i", src, "-frames:v", "1", "-vf", "scale=240:-1", thumb],
        { allowFail: true }
      );
    }
    if (!fs.existsSync(thumb)) return new NextResponse("thumb failed", { status: 500 });
    return serve(thumb);
  }

  // guard against traversal — hash is hex only
  if (!/^[a-f0-9]{4,64}$/i.test(hash)) {
    return new NextResponse("bad hash", { status: 400 });
  }
  const thumbFile = path.join(THUMBS_DIR, `${hash}.jpg`);
  if (!fs.existsSync(thumbFile)) return new NextResponse("not found", { status: 404 });
  return serve(thumbFile);
}
