import fs from "node:fs";
import path from "node:path";
import {
  RESULTS_CONFIG_JSON,
  RESULTS_LEARNINGS_JSON,
  RESULTS_IMPORTS_DIR,
  ensureResultsDirs,
} from "../paths";
import { DEFAULT_RESULTS_CONFIG, EMPTY_LEARNINGS } from "./types";
import type { ResultsConfig, LearningsFile, ImportRecord } from "./types";

function deepMerge<T>(base: T, over: any): T {
  if (over === null || over === undefined) return base;
  if (Array.isArray(base) || typeof base !== "object") return over as T;
  const out: any = { ...base };
  for (const k of Object.keys(over)) {
    const b = (base as any)[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) ? deepMerge(b, over[k]) : over[k];
  }
  return out;
}

export function loadResultsConfig(): ResultsConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(RESULTS_CONFIG_JSON, "utf8"));
    return deepMerge(DEFAULT_RESULTS_CONFIG, raw);
  } catch {
    return DEFAULT_RESULTS_CONFIG;
  }
}

export function saveResultsConfig(cfg: ResultsConfig): void {
  ensureResultsDirs();
  fs.writeFileSync(RESULTS_CONFIG_JSON, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

export function loadLearnings(): LearningsFile {
  try {
    const raw = JSON.parse(fs.readFileSync(RESULTS_LEARNINGS_JSON, "utf8"));
    return deepMerge(EMPTY_LEARNINGS, raw);
  } catch {
    return { ...EMPTY_LEARNINGS };
  }
}

export function saveLearnings(l: LearningsFile): void {
  ensureResultsDirs();
  fs.writeFileSync(RESULTS_LEARNINGS_JSON, JSON.stringify(l, null, 2) + "\n", "utf8");
}

export function saveImportRecord(rec: ImportRecord): string {
  ensureResultsDirs();
  const safeName = rec.data.replace(/[:.]/g, "-");
  const file = path.join(RESULTS_IMPORTS_DIR, `${safeName}.json`);
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + "\n", "utf8");
  return file;
}

export function loadAllImports(): ImportRecord[] {
  ensureResultsDirs();
  const out: ImportRecord[] = [];
  for (const f of fs.readdirSync(RESULTS_IMPORTS_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(RESULTS_IMPORTS_DIR, f), "utf8")));
    } catch {
      /* skip corrupt file */
    }
  }
  out.sort((a, b) => a.data.localeCompare(b.data));
  return out;
}
