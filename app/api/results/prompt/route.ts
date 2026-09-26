import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { loadComponentsCsv } from "@/lib/scan";
import { computeRanking } from "@/lib/results/aggregate";
import { buildDataBlock, buildPromptText } from "@/lib/results/promptBuilder";
import { loadResultsConfig, saveResultsConfig, loadAllImports, loadLearnings } from "@/lib/results/store";
import { RESULTS_PROMPTS_DIR, RESULTS_INPUTS_DIR, ensureResultsDirs } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST -> builds and saves the next learning prompt (prompts/run-N.md +
// inputs/run-N.json), advances run_atual and the "known ids" snapshot used
// to compute new_since_last_run next time.
export async function POST() {
  try {
    ensureResultsDirs();
    const cfg = loadConfig();
    const rows = loadComponentsCsv();
    const rcfg = loadResultsConfig();
    const imports = loadAllImports();
    const allRows = imports.flatMap((imp) => imp.linhas);
    const ranking = computeRanking(cfg, rows, allRows, rcfg.tiers);
    const learnings = loadLearnings();

    const run = rcfg.run_atual + 1;
    const lastImportDate = imports.length ? imports[imports.length - 1].data : "";
    const data = buildDataBlock(rcfg, ranking, rows, run, imports.length, lastImportDate);
    const prompt = buildPromptText(rcfg, ranking, learnings, data, run);

    const promptPath = path.join(RESULTS_PROMPTS_DIR, `run-${run}.md`);
    const inputPath = path.join(RESULTS_INPUTS_DIR, `run-${run}.json`);
    fs.writeFileSync(promptPath, prompt, "utf8");
    fs.writeFileSync(inputPath, JSON.stringify(data, null, 2), "utf8");

    saveResultsConfig({
      ...rcfg,
      run_atual: run,
      conhecidos: {
        hooks: ranking.hooks.filter((h) => h.tier >= 2).map((h) => h.id),
        bodies: ranking.bodies.filter((b) => b.tier >= 2).map((b) => b.id),
        ctas: ranking.ctas.filter((c) => c.tier >= 2).map((c) => c.id),
        combinations: ranking.combinations.filter((c) => c.tier >= 2).map((c) => c.id),
      },
    });

    return NextResponse.json({ run, prompt, data, path: promptPath });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
