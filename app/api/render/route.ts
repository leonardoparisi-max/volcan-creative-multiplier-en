import { NextRequest, NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { scanComponents } from "@/lib/scan";
import { startRenderJob, getJob, latestJob, requestCancel } from "@/lib/jobs";
import { humanize } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

// POST { leva? } → start a batch render. Returns { jobId, total }.
export async function POST(req: NextRequest) {
  try {
    const { leva } = (await req.json().catch(() => ({}))) as { leva?: string };
    const cfg = loadConfig();
    const rows = await scanComponents(cfg);
    const { jobId, total } = startRenderJob(cfg, rows, leva);
    return NextResponse.json({ jobId, total });
  } catch (e: any) {
    const raw = e?.message || String(e);
    return NextResponse.json({ error: humanize(raw), detalhe: raw }, { status: 500 });
  }
}

// GET ?id= → poll job status. GET without id → the most recent job (so the UI
// can re-attach after a page reload or a dev-server restart).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  const job = id ? getJob(id) : latestJob();
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  return NextResponse.json(job);
}

// DELETE ?id= → request cancellation.
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  const ok = requestCancel(id);
  return NextResponse.json({ ok });
}
