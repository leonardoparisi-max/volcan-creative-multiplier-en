import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { run } from "./ffmpeg/exec";

// drawtext needs an absolute .ttf PATH, not a family name. libass (subtitles)
// wants a family NAME plus a directory to search. We resolve both here.

const FONT_DIRS = [
  path.join(os.homedir(), "Library/Fonts"),
  "/Library/Fonts",
  "/System/Library/Fonts",
  "/System/Library/Fonts/Supplemental",
];

// Family string like "Montserrat ExtraBold" → candidate filenames.
function candidateFilenames(family: string): string[] {
  const compact = family.replace(/\s+/g, ""); // MontserratExtraBold
  const dashed = family.replace(/\s+/g, "-"); // Montserrat-ExtraBold
  return [
    `${compact}.ttf`,
    `${dashed}.ttf`,
    `${compact}.otf`,
    `${dashed}.otf`,
  ];
}

let fcListCache: string | null = null;
async function fcList(binHint?: string): Promise<string> {
  if (fcListCache !== null) return fcListCache;
  const bin = binHint || "fc-list";
  try {
    const { stdout } = await run(bin, [":", "file", "family", "style"], {
      allowFail: true,
    });
    fcListCache = stdout;
  } catch {
    fcListCache = "";
  }
  return fcListCache;
}

export interface FontResolution {
  file: string | null; // absolute path for drawtext
  family: string; // family name for libass
  dir: string | null; // fontsdir for libass
}

/**
 * Resolve "Montserrat ExtraBold" to a concrete file. Strategy:
 *  1. direct filename match across known font dirs (fast, no deps)
 *  2. fontconfig fc-list match (if installed) as a fallback
 */
export async function resolveFont(family: string): Promise<FontResolution> {
  // 1. filename scan
  for (const dir of FONT_DIRS) {
    for (const name of candidateFilenames(family)) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) {
        return { file: p, family, dir };
      }
    }
  }
  // 2. fc-list (optional)
  const listing = await fcList();
  if (listing) {
    const wanted = family.toLowerCase();
    for (const line of listing.split("\n")) {
      // format: /path/file.ttf: Family Name:style=Style
      const file = line.split(":")[0]?.trim();
      if (!file) continue;
      const rest = line.toLowerCase();
      if (rest.includes(wanted) && /\.(ttf|otf)$/i.test(file)) {
        return { file, family, dir: path.dirname(file) };
      }
    }
  }
  return { file: null, family, dir: null };
}
