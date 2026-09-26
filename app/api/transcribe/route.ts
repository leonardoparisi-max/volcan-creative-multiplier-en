import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { loadComponentsCsv } from "@/lib/scan";
import { kindDir } from "@/lib/paths";
import { hashFile } from "@/lib/hash";
import { probe } from "@/lib/ffmpeg/probe";
import { detectTrim } from "@/lib/ffmpeg/trim";
import {
  transcribeWords,
  transcriptPath,
  editedTranscriptPath,
  readTranscriptFile,
} from "@/lib/whisper";
import type { Config, ComponentRow, Word } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function findRow(id: string) {
  return loadComponentsCsv().find((r) => r.id === id);
}

// components.csv doesn't persist `hash` (it's runtime-only) — hash the file
// directly, same as buildMaster/runPreview do. hashFile has its own
// mtime+size cache, so this is cheap after the first call.
async function resolveHash(cfg: Config, row: ComponentRow): Promise<string | null> {
  const file = path.join(kindDir(cfg, row.tipo), row.arquivo);
  if (!fs.existsSync(file)) return null;
  return (await hashFile(file)).slice(0, 16);
}

// GET ?id= → current caption words (the hand-edited version if one exists).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  const cfg = loadConfig();
  const row = findRow(id);
  if (!row) return NextResponse.json({ error: "component not found" }, { status: 404 });
  const hash = await resolveHash(cfg, row);
  if (!hash) return NextResponse.json({ words: [], revisado: false });

  const edited = readTranscriptFile(editedTranscriptPath(hash, cfg.whisper.language));
  if (edited) return NextResponse.json({ words: edited.words, revisado: true });

  const raw = readTranscriptFile(transcriptPath(hash, cfg.whisper.language));
  return NextResponse.json({ words: raw?.words ?? [], revisado: false });
}

// PUT { id, words } → save the hand-edited text (timings untouched) as <hash>_<lang>.edited.json.
export async function PUT(req: NextRequest) {
  try {
    const { id, words } = (await req.json()) as { id: string; words: Word[] };
    const cfg = loadConfig();
    const row = findRow(id);
    if (!row) return NextResponse.json({ error: "component not found" }, { status: 404 });
    const hash = await resolveHash(cfg, row);
    if (!hash) return NextResponse.json({ error: "file missing" }, { status: 404 });
    if (!Array.isArray(words)) {
      return NextResponse.json({ error: "invalid words" }, { status: 400 });
    }
    const text = words.map((w) => (w.text || "").trim()).filter(Boolean).join(" ");
    const file = editedTranscriptPath(hash, cfg.whisper.language);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ words, text }), "utf8");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

// POST { id } → discard any saved edits and the cached transcript, transcribe again.
export async function POST(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id: string };
    const cfg = loadConfig();
    const row = findRow(id);
    if (!row) return NextResponse.json({ error: "component not found" }, { status: 404 });

    const file = path.join(kindDir(cfg, row.tipo), row.arquivo);
    if (!fs.existsSync(file)) {
      return NextResponse.json({ error: "file missing" }, { status: 404 });
    }
    const hash = (await hashFile(file)).slice(0, 16);
    fs.rmSync(transcriptPath(hash, cfg.whisper.language), { force: true });
    fs.rmSync(editedTranscriptPath(hash, cfg.whisper.language), { force: true });

    const info = await probe(cfg, file, hash);
    const window = await detectTrim(cfg, file, info.duration);
    const words = await transcribeWords(cfg, file, window);
    const text = words.map((w) => w.text).join(" ").trim();
    fs.mkdirSync(path.dirname(transcriptPath(hash, cfg.whisper.language)), { recursive: true });
    fs.writeFileSync(transcriptPath(hash, cfg.whisper.language), JSON.stringify({ words, text }), "utf8");

    return NextResponse.json({ words });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
