import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { scanComponents } from "@/lib/scan";
import { planCombinations } from "@/lib/combinations";
import { loadConnections } from "@/lib/connections";
import { finalDuration } from "@/lib/ffmpeg/assemble";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Compute the combination count + estimates (time & disk) BEFORE rendering.
 * Estimate model:
 *   avg final duration ≈ mean(hook)+mean(body)+mean(cta) − 2·transition
 *   disk ≈ count · avgDur · (bitrate_final bytes/s)
 *   time ≈ count · avgDur · perSecFactor / concurrency  (rough, encoder-based)
 */
export async function POST() {
  try {
    const cfg = loadConfig();
    const rows = await scanComponents(cfg);
    const plan = planCombinations(rows, {
      connections: loadConnections(),
      pattern: cfg.render.padrao_nome,
      prefixo: cfg.render.prefixo,
    });

    const active = rows.filter((r) => r.ativo && r.existe !== false);
    const mean = (t: "hook" | "body" | "cta") => {
      const xs = active.filter((r) => r.tipo === t).map((r) => r.duracao ?? 0);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    };
    const dTrans = cfg.transicao.tipo === "cut" ? 0 : cfg.transicao.duracao;
    const avgDur = Math.max(
      1,
      finalDuration(
        [
          { path: "", duration: mean("hook") },
          { path: "", duration: mean("body") },
          { path: "", duration: mean("cta") },
        ],
        cfg.transicao.tipo,
        dTrans,
        cfg.video.fps
      )
    );

    // bitrate like "10M" → bits/s
    const br = parseBitrate(cfg.video.bitrate_final);
    const diskBytes = plan.count * avgDur * (br / 8);

    // encode speed factor (seconds of wall time per second of output, 1080x1920)
    const perSec = cfg.video.encoder === "h264_videotoolbox" ? 0.6 : 1.2; // measured on M-series, conc 4
    const conc = Math.max(1, cfg.render.concorrencia);
    const timeSec = (plan.count * avgDur * perSec) / conc;

    return NextResponse.json({
      ...plan,
      avgDurationSec: +avgDur.toFixed(2),
      estDiskMb: +(diskBytes / (1024 * 1024)).toFixed(0),
      estTimeSec: Math.round(timeSec),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

function parseBitrate(s: string): number {
  const m = /^([\d.]+)\s*([kKmMgG]?)/.exec(s.trim());
  if (!m) return 10_000_000;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === "g" ? 1e9 : unit === "m" ? 1e6 : unit === "k" ? 1e3 : 1;
  return n * mult;
}
