import path from "node:path";
import fs from "node:fs";
import type { Config } from "./types";

/** Project root — the folder that holds config.json (cwd of `npm run dev`). */
export const ROOT = process.cwd();

export function resolveFromRoot(p: string): string {
  if (!p) return ROOT;
  return path.isAbsolute(p) ? p : path.resolve(ROOT, p);
}

export function inputDir(cfg: Config): string {
  return resolveFromRoot(cfg.input_dir);
}
export function outputDir(cfg: Config): string {
  return resolveFromRoot(cfg.output_dir);
}

export const CACHE_DIR = path.join(ROOT, ".cache");
export const NORMALIZED_DIR = path.join(CACHE_DIR, "normalized");
export const SUBS_DIR = path.join(CACHE_DIR, "subs");
export const PROBE_DIR = path.join(CACHE_DIR, "probe");
export const THUMBS_DIR = path.join(CACHE_DIR, "thumbs");
export const TARJAS_DIR = path.join(CACHE_DIR, "tarjas");
export const TRANSCRIPTS_DIR = path.join(CACHE_DIR, "transcripts");

/** Images used by split layouts live alongside the clips. */
export function imagesDir(cfg: Config): string {
  return path.join(inputDir(cfg), "imagens");
}

export function kindDir(cfg: Config, kind: "hook" | "body" | "cta"): string {
  const sub = kind === "hook" ? "hooks" : kind === "body" ? "bodies" : "ctas";
  return path.join(inputDir(cfg), sub);
}

export function ensureDirs(cfg: Config): void {
  for (const d of [
    CACHE_DIR,
    NORMALIZED_DIR,
    SUBS_DIR,
    PROBE_DIR,
    THUMBS_DIR,
    TARJAS_DIR,
    TRANSCRIPTS_DIR,
    outputDir(cfg),
    imagesDir(cfg),
    kindDir(cfg, "hook"),
    kindDir(cfg, "body"),
    kindDir(cfg, "cta"),
  ]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export const COMPONENTS_CSV = path.join(ROOT, "components.csv");
export const CONFIG_JSON = path.join(ROOT, "config.json");

export const RESULTS_DIR = path.join(ROOT, "results");
export const RESULTS_CONFIG_JSON = path.join(RESULTS_DIR, "config.json");
export const RESULTS_LEARNINGS_JSON = path.join(RESULTS_DIR, "learnings.json");
export const RESULTS_IMPORTS_DIR = path.join(RESULTS_DIR, "imports");
export const RESULTS_PROMPTS_DIR = path.join(RESULTS_DIR, "prompts");
export const RESULTS_INPUTS_DIR = path.join(RESULTS_DIR, "inputs");

export function ensureResultsDirs(): void {
  for (const d of [RESULTS_DIR, RESULTS_IMPORTS_DIR, RESULTS_PROMPTS_DIR, RESULTS_INPUTS_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
