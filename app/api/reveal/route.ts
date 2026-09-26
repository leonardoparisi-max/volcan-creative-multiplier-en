import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { run } from "@/lib/ffmpeg/exec";
import { loadConfig } from "@/lib/config";
import { outputDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open a folder — or, with `file`, one file inside it (e.g. the manifest) —
// in the default macOS app (`open`). Confined to the output directory.
export async function POST(req: NextRequest) {
  try {
    const { batch, file } = (await req.json().catch(() => ({}))) as {
      batch?: string;
      file?: string;
    };
    const cfg = loadConfig();
    const out = outputDir(cfg);
    let target = out;
    if (batch && /^[\w.\-:]+$/.test(batch)) {
      const candidate = path.join(out, batch);
      if (fs.existsSync(candidate)) target = candidate;
    }
    if (file && target !== out && /^[\w.\-]+$/.test(file)) {
      const candidate = path.join(target, file);
      if (fs.existsSync(candidate)) target = candidate;
    }
    if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
    await run("open", [target], { allowFail: true });
    return NextResponse.json({ ok: true, path: target });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
