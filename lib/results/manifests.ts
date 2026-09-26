import fs from "node:fs";
import path from "node:path";
import { outputDir } from "../paths";
import type { Config } from "../types";

/** One rendered combination, as recorded in a batch's manifest.json. */
export interface ManifestCombo {
  versao_id: string;
  hook: string;
  body: string;
  cta: string;
  hook_texto: string;
  body_texto: string;
  cta_texto: string;
  hook_modo: string; // tarja|simples|legenda|nenhum — doubles as a text_source hint
  hook_layout: string;
  hook_variante_de: string;
  filename: string;
}

/**
 * Reads every output/<leva>/manifest.json (skips `_preview`) and returns a
 * catalog keyed by versao_id. The same versao_id can appear in more than one
 * leva (re-rendering an unchanged combo reuses it) — later entries win, they
 * all describe the same content anyway.
 */
export function loadManifestCatalog(cfg: Config): Map<string, ManifestCombo> {
  const catalog = new Map<string, ManifestCombo>();
  const dir = outputDir(cfg);
  let batches: string[] = [];
  try {
    batches = fs.readdirSync(dir).filter((f) => f !== "_preview");
  } catch {
    return catalog;
  }
  for (const b of batches) {
    const manifestPath = path.join(dir, b, "manifest.json");
    let data: any;
    try {
      data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      continue;
    }
    for (const a of data.arquivos ?? []) {
      if (!a.versao_id) continue;
      catalog.set(a.versao_id, {
        versao_id: a.versao_id,
        hook: a.hook_id ?? "",
        body: a.body_id ?? "",
        cta: a.cta_id ?? "",
        hook_texto: a.hook_texto ?? "",
        body_texto: a.body_texto ?? "",
        cta_texto: a.cta_texto ?? "",
        hook_modo: a.hook_modo ?? "",
        hook_layout: a.hook_layout ?? "",
        hook_variante_de: a.hook_variante_de ?? "",
        filename: a.arquivo ?? "",
      });
    }
  }
  return catalog;
}
