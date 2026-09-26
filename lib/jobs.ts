import fs from "node:fs";
import path from "node:path";
import crypto, { randomUUID } from "node:crypto";
import { hashFile } from "./hash";
import { buildMaster, MasterResult } from "./ffmpeg/normalize";
import {
  renderCombination,
  finalDuration,
  fileSizeMb,
  Segment,
  UniqueMeta,
} from "./ffmpeg/assemble";
import { runInGroup, killGroup } from "./ffmpeg/exec";
import { planCombinations, type PlanOptions } from "./combinations";
import { loadConnections, CONNECTIONS_JSON } from "./connections";
import { runPool } from "./queue";
import { parseCsv, serializeCsv } from "./csv";
import { humanize } from "./errors";
import {
  ensureDirs,
  outputDir,
  kindDir,
  CACHE_DIR,
  CONFIG_JSON,
  COMPONENTS_CSV,
} from "./paths";
import type { Config, ComponentRow, JobState } from "./types";

// ---------------------------------------------------------------------------
// Job registry: in memory for speed, mirrored to disk so a page reload, a
// dev-server module reload (HMR) or a restart never loses the job. The batch
// folder also gets a `status.json` copy for whoever opens it in Finder.
// ---------------------------------------------------------------------------
const JOBS = new Map<string, JobState>();
const CANCEL = new Set<string>();
const BATCH_DIRS = new Map<string, string>(); // job id → absolute batch dir
const JOBS_DIR = path.join(CACHE_DIR, "jobs");
const RUNNING = new Set<string>(["queued", "ingesting", "rendering"]);

function jobFile(id: string): string {
  return path.join(JOBS_DIR, `${id}.json`);
}

const persistTimers = new Map<string, NodeJS.Timeout>();
function persist(job: JobState, immediate = false) {
  const write = () => {
    persistTimers.delete(job.id);
    try {
      fs.mkdirSync(JOBS_DIR, { recursive: true });
      const json = JSON.stringify(job);
      fs.writeFileSync(jobFile(job.id), json);
      const dir = BATCH_DIRS.get(job.id);
      if (dir && fs.existsSync(dir)) fs.writeFileSync(path.join(dir, "status.json"), json);
    } catch {
      /* best effort */
    }
  };
  if (immediate) {
    const t = persistTimers.get(job.id);
    if (t) clearTimeout(t);
    write();
    return;
  }
  if (persistTimers.has(job.id)) return;
  persistTimers.set(job.id, setTimeout(write, 400));
}

function lastTouch(j: JobState): number {
  return j.finishedAt ?? j.touchedAt ?? j.startedAt;
}

export function getJob(id: string): JobState | undefined {
  const mem = JOBS.get(id);
  if (mem) return mem;
  try {
    const j = JSON.parse(fs.readFileSync(jobFile(id), "utf8")) as JobState;
    // "running" on disk but not in this process and silent for 2 min → the
    // process that owned it is gone (server restart). Say so instead of
    // showing a progress bar forever.
    if (RUNNING.has(j.phase) && Date.now() - lastTouch(j) > 120_000) {
      j.phase = "error";
      j.message = "Job lost (the server restarted during the render). Render again.";
    }
    return j;
  } catch {
    return undefined;
  }
}

/** The most recently started job, from memory or disk. */
export function latestJob(): JobState | undefined {
  let best: JobState | undefined;
  for (const j of JOBS.values()) if (!best || j.startedAt > best.startedAt) best = j;
  try {
    for (const f of fs.readdirSync(JOBS_DIR)) {
      if (!f.endsWith(".json")) continue;
      const id = f.replace(/\.json$/, "");
      if (JOBS.has(id)) continue;
      const j = getJob(id);
      if (j && (!best || j.startedAt > best.startedAt)) best = j;
    }
  } catch {
    /* no jobs dir yet */
  }
  return best;
}

export function requestCancel(id: string): boolean {
  if (!JOBS.has(id)) return false;
  CANCEL.add(id);
  const j = JOBS.get(id)!;
  const killed = killGroup(id);
  j.message = `Cancelling… (${killed} process(es) stopped)`;
  log(j, j.message);
  persist(j, true);
  return true;
}

function newJob(total: number): JobState {
  const job: JobState = {
    id: randomUUID().slice(0, 8),
    phase: "queued",
    total,
    done: 0,
    failed: 0,
    skipped: 0,
    current: [],
    log: [],
    results: [],
    startedAt: Date.now(),
    touchedAt: Date.now(),
  };
  JOBS.set(job.id, job);
  return job;
}

function log(job: JobState, msg: string) {
  const line = `${new Date().toLocaleTimeString()}  ${msg}`;
  job.log.push(line);
  if (job.log.length > 500) job.log.splice(0, job.log.length - 500);
  job.touchedAt = Date.now();
  persist(job);
}

function srcPath(cfg: Config, row: ComponentRow): string {
  return path.join(kindDir(cfg, row.tipo), row.arquivo);
}

const MANIFEST_HEADER = [
  "arquivo",
  "versao_id",
  "hook_id",
  "body_id",
  "cta_id",
  "hook_arquivo",
  "body_arquivo",
  "cta_arquivo",
  "hook_texto",
  "body_texto",
  "cta_texto",
  "hook_modo",
  "hook_layout",
  "hook_variante_de",
  "transicao",
  "duracao_seg",
  "tamanho_mb",
  "status",
  "erro",
  "gerado_em",
];

/** Plan options from the current config + connection graph. */
function planOpts(cfg: Config): PlanOptions {
  return {
    connections: loadConnections(),
    pattern: cfg.render.padrao_nome,
    prefixo: cfg.render.prefixo,
  };
}

/** Slug for the "leva" (named batch) folder: lowercase letters, digits, "-". */
export function slugLeva(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** How the hook's on-screen text is produced — for the manifest's hook_modo column. */
function hookMode(row: ComponentRow | undefined): string {
  if (!row) return "nenhum";
  if ((row.texto_overlay ?? "").trim()) return row.texto_estilo === "simples" ? "simples" : "tarja";
  return row.legenda_ativa ? "legenda" : "nenhum";
}

/**
 * Deterministic content id for one combination: same 3 masters + same
 * transition + same output video config → same id → same filename. Change
 * any of them and the id (and the filename) changes.
 */
function versaoId(mh: MasterResult, mb: MasterResult, mc: MasterResult, cfg: Config): string {
  const h = crypto.createHash("sha256");
  h.update(mh.key);
  h.update(mb.key);
  h.update(mc.key);
  h.update(JSON.stringify(cfg.transicao));
  h.update(JSON.stringify(cfg.video));
  return h.digest("hex").slice(0, 8);
}

/**
 * Ingest every active component into a normalized master (deduped by id), then
 * render each combination with the configured concurrency. Runs detached; the
 * returned job id is polled via GET /api/render?id=.
 */
export function startRenderJob(
  cfg: Config,
  rows: ComponentRow[],
  leva?: string
): { jobId: string; total: number } {
  const broken = rows.filter((r) => r.ativo && r.erro && r.existe !== false);
  if (broken.length) {
    throw new Error(
      `Fix before rendering: ${broken.map((r) => `${r.arquivo} (${r.erro})`).join("; ")}`
    );
  }
  const plan = planCombinations(rows, planOpts(cfg));
  if (!plan.count) throw new Error("No combination to render.");
  const job = newJob(plan.count);
  const levaSlug = slugLeva(leva || "");
  const batchId =
    levaSlug ||
    `batch_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  job.batchId = batchId;
  BATCH_DIRS.set(job.id, path.join(outputDir(cfg), batchId));
  persist(job, true);

  // fire and forget; every child process spawned below belongs to this job
  void runInGroup(job.id, () => execRenderJob(cfg, rows, job, batchId)).catch((err) => {
    job.phase = "error";
    job.message = humanize(String(err?.message || err));
    log(job, `FATAL ERROR: ${job.message}`);
    job.finishedAt = Date.now();
    persist(job, true);
  });

  return { jobId: job.id, total: plan.count };
}

async function ingestAll(
  cfg: Config,
  rows: ComponentRow[],
  job: JobState
): Promise<Map<string, MasterResult>> {
  const active = rows.filter((r) => r.ativo && r.existe !== false && !r.erro);
  const masters = new Map<string, MasterResult>();
  job.phase = "ingesting";
  job.message = `Preparing ${active.length} components…`;
  log(job, `Ingestion: ${active.length} components`);

  // ingest with the same concurrency (bounded ffmpeg processes; whisper is
  // serialized internally — see lib/whisper.ts)
  await runPool(active, Math.max(1, cfg.render.concorrencia), async (row) => {
    if (CANCEL.has(job.id)) return;
    const file = srcPath(cfg, row);
    if (!fs.existsSync(file)) {
      log(job, `  ${row.id}: file missing (${row.arquivo})`);
      return;
    }
    const hash = (await hashFile(file)).slice(0, 16);
    try {
      const m = await buildMaster(cfg, row, file, hash, {
        onLog: (msg) => log(job, msg),
      });
      masters.set(row.id, m);
      log(job, `  ${row.id}: master ${m.cached ? "(cache)" : "OK"}`);
    } catch (e: any) {
      if (CANCEL.has(job.id)) return;
      log(job, `  ${row.id}: ingestion FAILED — ${humanize(e?.message || String(e))}`);
    }
  });
  return masters;
}

async function execRenderJob(
  cfg: Config,
  rows: ComponentRow[],
  job: JobState,
  batchId: string
): Promise<void> {
  ensureDirs(cfg);
  const batchDir = path.join(outputDir(cfg), batchId);

  const masters = await ingestAll(cfg, rows, job);
  if (CANCEL.has(job.id)) {
    job.phase = "cancelled";
    job.finishedAt = Date.now();
    log(job, "Cancelled during ingestion.");
    CANCEL.delete(job.id);
    persist(job, true);
    return;
  }

  // only now: a job that dies during ingestion leaves no empty batch folder
  fs.mkdirSync(batchDir, { recursive: true });

  // Snapshot the state that produced this leva, so a batch can be reproduced
  // or audited later even if the live config/components/connections move on.
  for (const [src, name] of [
    [CONFIG_JSON, "config.snapshot.json"],
    [COMPONENTS_CSV, "components.snapshot.csv"],
    [CONNECTIONS_JSON, "connections.snapshot.json"],
  ] as const) {
    try {
      fs.copyFileSync(src, path.join(batchDir, name));
    } catch {
      /* best effort */
    }
  }

  const plan = planCombinations(rows, planOpts(cfg));
  job.total = plan.count;
  job.phase = "rendering";
  job.message = `Rendering ${plan.count} combinations…`;
  log(job, `Render: ${plan.count} combinations, concurrency ${cfg.render.concorrencia}`);

  // manifest.csv is merged by `arquivo` and rewritten after every file: a
  // killed job leaves a valid, complete-so-far file, and re-rendering the same
  // leva keeps rows from earlier runs (older versao_id filenames included) —
  // nothing is lost, only added to or updated.
  const manifestPath = path.join(batchDir, "manifest.csv");
  const manifestRows = new Map<string, string[]>(); // arquivo → row
  try {
    const existing = parseCsv(fs.readFileSync(manifestPath, "utf8"));
    if (existing.length && existing[0].join("") === MANIFEST_HEADER.join("")) {
      for (let i = 1; i < existing.length; i++) {
        if (existing[i][0]) manifestRows.set(existing[i][0], existing[i]);
      }
    }
  } catch {
    /* no manifest yet */
  }
  const writeManifestCsv = () => {
    const sorted = [...manifestRows.values()].sort((a, b) => a[0].localeCompare(b[0]));
    fs.writeFileSync(manifestPath, serializeCsv([MANIFEST_HEADER, ...sorted]), "utf8");
  };
  writeManifestCsv();

  await runPool(
    plan.combinations,
    Math.max(1, cfg.render.concorrencia),
    async (combo) => {
      if (CANCEL.has(job.id)) return;
      const started = Date.now();

      const mh = masters.get(combo.hook);
      const mb = masters.get(combo.body);
      const mc = masters.get(combo.cta);

      // Deterministic filename: same 3 masters + same transition/video config
      // → same versao_id → same file. Falls back to the plain combo name when
      // a master is missing (the error path below reports why).
      const vId = mh && mb && mc ? versaoId(mh, mb, mc, cfg) : "";
      const filename = vId ? combo.filename.replace(/\.mp4$/i, `_v${vId}.mp4`) : combo.filename;

      job.current.push(filename);
      persist(job);
      const outPath = path.join(batchDir, filename);

      const rowH = rows.find((r) => r.id === combo.hook);
      const rowB = rows.find((r) => r.id === combo.body);
      const rowC = rows.find((r) => r.id === combo.cta);
      const manifestBase = [
        filename,
        vId,
        combo.hook,
        combo.body,
        combo.cta,
        rowH?.arquivo ?? "",
        rowB?.arquivo ?? "",
        rowC?.arquivo ?? "",
        mh?.texto ?? "",
        mb?.texto ?? "",
        mc?.texto ?? "",
        hookMode(rowH),
        rowH?.layout ?? "",
        rowH?.variante_de ?? "",
        cfg.transicao.tipo,
      ];

      try {
        if (!mh || !mb || !mc) {
          throw new Error("missing master(s) — ingestion failed");
        }
        const segs: Segment[] = [
          { path: mh.path, duration: mh.duration },
          { path: mb.path, duration: mb.duration },
          { path: mc.path, duration: mc.duration },
        ];

        // "unique metadata": fresh title/comment on every real encode (no
        // filename tag needed — versao_id already is one; no creation_time
        // jitter either) so the file's bytes differ from any earlier export of
        // this same combination. Without this, re-rendering an unchanged
        // combo into a new leva can produce a byte-identical file, and Meta
        // dedupes uploads it already has on file — it reuses the old ad/video
        // id instead of treating this as a fresh, separately-testable creative.
        // On by default for exactly that reason.
        const unique = cfg.render.arquivos_unicos === true;
        const meta: UniqueMeta | undefined = unique
          ? { title: `${combo.hook}-${combo.body}-${combo.cta}-${vId}`, comment: randomUUID() }
          : undefined;

        let dur: number;
        let status: "ok" | "pulado";
        if (!cfg.render.sobrescrever_existentes && fs.existsSync(outPath)) {
          dur = finalDuration(segs, cfg.transicao.tipo, cfg.transicao.duracao, cfg.video.fps);
          status = "pulado";
          log(job, `  ${filename}: already exists, skipping`);
        } else {
          const warnings: string[] = [];
          dur = await renderCombination(cfg, segs, outPath, meta, warnings); // measured
          for (const w of warnings) log(job, `  WARNING ${w}`);
          status = "ok";
        }

        manifestRows.set(filename, [
          ...manifestBase,
          dur.toFixed(2),
          String(fileSizeMb(outPath)),
          status,
          "",
          new Date().toISOString(),
        ]);
        writeManifestCsv();

        job.results.push({
          filename,
          ok: true,
          durationSeg: +dur.toFixed(2),
          sizeMb: fileSizeMb(outPath),
          ms: Date.now() - started,
        });
        if (status === "pulado") job.skipped++;
        else job.done++;
      } catch (e: any) {
        if (CANCEL.has(job.id)) {
          log(job, `  ${filename}: cancelled`);
        } else {
          const erro = e?.message || String(e);
          job.failed++;
          job.results.push({ filename, ok: false, error: erro }); // raw — the "detalhe"
          log(job, `  ${filename}: ${humanize(erro)}`);
          manifestRows.set(filename, [...manifestBase, "", "", "erro", erro, new Date().toISOString()]);
          writeManifestCsv();
        }
      } finally {
        job.current = job.current.filter((f) => f !== filename);
        persist(job);
      }
    }
  );

  // manifest.json: one snapshot at the end, for whoever wants the whole batch
  // as structured data (results dashboard, a script, a support request).
  const usedRows = rows.filter((r) => r.ativo && r.existe !== false && !r.erro);
  const arquivos = [...manifestRows.values()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((r) => Object.fromEntries(MANIFEST_HEADER.map((h, i) => [h, r[i] ?? ""])));
  fs.writeFileSync(
    path.join(batchDir, "manifest.json"),
    JSON.stringify(
      {
        leva: batchId,
        batchId,
        geradoEm: new Date().toISOString(),
        config: cfg,
        componentes: usedRows,
        arquivos,
      },
      null,
      2
    ),
    "utf8"
  );

  if (CANCEL.has(job.id)) {
    job.phase = "cancelled";
    job.message = `Cancelled. ${job.done} ready, ${job.skipped} skipped, ${job.failed} failed.`;
  } else {
    job.phase = "done";
    job.message = `Done: ${job.done} ready, ${job.skipped} skipped, ${job.failed} failed.`;
  }
  job.finishedAt = Date.now();
  CANCEL.delete(job.id);
  log(job, job.message);
  persist(job, true);
}

/**
 * Render a SINGLE chosen combination for the Preview panel. Blocks until done
 * and returns the output path (under output/_preview). Style-validation route,
 * so it always rebuilds the 3 masters against current config first.
 */
export async function runPreview(
  cfg: Config,
  rows: ComponentRow[],
  ids: { hook: string; body: string; cta: string },
  onLog?: (msg: string) => void
): Promise<{ path: string; filename: string; duration: number }> {
  ensureDirs(cfg);
  const previewDir = path.join(outputDir(cfg), "_preview");
  fs.mkdirSync(previewDir, { recursive: true });

  const pick = (id: string) => rows.find((r) => r.id === id);
  const rowH = pick(ids.hook);
  const rowB = pick(ids.body);
  const rowC = pick(ids.cta);
  if (!rowH || !rowB || !rowC) throw new Error("Selected component not found");
  for (const r of [rowH, rowB, rowC]) {
    if (r.erro) throw new Error(`${r.arquivo}: ${r.erro}`);
  }

  const masters: MasterResult[] = [];
  for (const row of [rowH, rowB, rowC]) {
    const file = srcPath(cfg, row);
    if (!fs.existsSync(file)) throw new Error(`File missing: ${row.arquivo}`);
    const hash = (await hashFile(file)).slice(0, 16);
    onLog?.(`  ${row.id}: preparing…`);
    masters.push(await buildMaster(cfg, row, file, hash, { onLog }));
  }

  const segs: Segment[] = masters.map((m) => ({
    path: m.path,
    duration: m.duration,
  }));
  const filename = `${rowH.id}_${rowB.id}_${rowC.id}.mp4`;
  const outPath = path.join(previewDir, filename);
  onLog?.("  assembling the preview…");
  const dur = await renderCombination(cfg, segs, outPath);
  return { path: outPath, filename, duration: dur };
}

/**
 * Same as runPreview, but tracked as a job (in the same registry render jobs
 * use) so the UI can poll GET /api/render?id= and show the log live instead
 * of blocking on one request for however long ingestion + render takes.
 */
export function startPreviewJob(
  cfg: Config,
  rows: ComponentRow[],
  ids: { hook: string; body: string; cta: string }
): { jobId: string } {
  const job = newJob(1);
  job.phase = "previewing";
  persist(job, true);

  void runInGroup(job.id, async () => {
    const res = await runPreview(cfg, rows, ids, (msg) => log(job, msg));
    job.results = [
      {
        filename: res.filename,
        ok: true,
        durationSeg: +res.duration.toFixed(2),
        sizeMb: fileSizeMb(res.path),
      },
    ];
    job.done = 1;
    job.phase = "done";
    job.message = "Preview ready.";
    job.finishedAt = Date.now();
    persist(job, true);
  }).catch((err) => {
    const msg = humanize(String(err?.message || err));
    job.phase = "error";
    job.message = msg;
    job.results = [{ filename: "", ok: false, error: String(err?.message || err) }];
    log(job, `ERRO: ${msg}`);
    job.finishedAt = Date.now();
    persist(job, true);
  });

  return { jobId: job.id };
}
