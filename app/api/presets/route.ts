import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "@/lib/paths";
import { loadConfig, saveConfig } from "@/lib/config";
import type { Config } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRESETS_DIR = path.join(ROOT, "presets");

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\- ]+/g, "")
    .trim();
}

/** The style-relevant slice of Config a preset stores (not paths/bin/whisper). */
function styleSlice(cfg: Config) {
  return {
    video: cfg.video,
    audio: cfg.audio,
    trim: cfg.trim,
    transicao: cfg.transicao,
    legenda: cfg.legenda,
    overlay_hook: cfg.overlay_hook,
    tarja: cfg.tarja,
    layout: cfg.layout,
  };
}

// GET            → { presets: string[] }
// GET ?name=X    → { config: Config }  (current config merged with preset style)
export async function GET(req: NextRequest) {
  fs.mkdirSync(PRESETS_DIR, { recursive: true });
  const name = req.nextUrl.searchParams.get("name");

  if (!name) {
    const presets = fs
      .readdirSync(PRESETS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    return NextResponse.json({ presets });
  }

  const file = path.join(PRESETS_DIR, `${slug(name)}.json`);
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: "preset not found" }, { status: 404 });
  }
  const style = JSON.parse(fs.readFileSync(file, "utf8"));
  const config = { ...loadConfig(), ...style };
  return NextResponse.json({ config });
}

// POST { name, config } → save the style slice as a preset
export async function POST(req: NextRequest) {
  try {
    const { name, config } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "missing name" }, { status: 400 });
    fs.mkdirSync(PRESETS_DIR, { recursive: true });
    const file = path.join(PRESETS_DIR, `${slug(name)}.json`);
    fs.writeFileSync(file, JSON.stringify(styleSlice(config as Config), null, 2), "utf8");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
