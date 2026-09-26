import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "./paths";

/**
 * SHA256 of a file's contents. Streamed so large videos don't blow memory.
 * Used to key the normalized-master cache: swap a file (same name) → new hash
 * → automatic reprocess.
 */
export function hashFileRaw(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// ---------------------------------------------------------------------------
// Hash cache keyed by (absolute path, size, mtime). Every scan used to re-read
// every clip in full (the UI scans on each count change); with a few GB of
// iPhone footage that was seconds per click. Same size+mtime → same content
// for our purposes; any edit/replace changes mtime and triggers a re-hash.
// ---------------------------------------------------------------------------
interface HashEntry {
  size: number;
  mtimeMs: number;
  hash: string;
}
const HASH_CACHE_FILE = path.join(CACHE_DIR, "hashes.json");
let cache: Record<string, HashEntry> | null = null;
let dirty = false;
let flushTimer: NodeJS.Timeout | null = null;

function loadCache(): Record<string, HashEntry> {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(HASH_CACHE_FILE, "utf8"));
  } catch {
    cache = {};
  }
  return cache!;
}

function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!dirty || !cache) return;
    dirty = false;
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(HASH_CACHE_FILE, JSON.stringify(cache));
    } catch {
      /* cache only */
    }
  }, 300);
}

export async function hashFile(filePath: string): Promise<string> {
  const abs = path.resolve(filePath);
  const st = fs.statSync(abs);
  const c = loadCache();
  const hit = c[abs];
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.hash;
  const hash = await hashFileRaw(abs);
  c[abs] = { size: st.size, mtimeMs: st.mtimeMs, hash };
  scheduleFlush();
  return hash;
}

export function shortHash(full: string): string {
  return full.slice(0, 12);
}
