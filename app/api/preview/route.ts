import { NextRequest, NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { scanComponents } from "@/lib/scan";
import { startPreviewJob } from "@/lib/jobs";
import { humanize } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

// Starts a preview as a tracked job (same registry as render) and returns its
// id right away — poll GET /api/render?id= for the log + result, same as the
// RenderBar does for a full batch.
export async function POST(req: NextRequest) {
  try {
    const { hook, body, cta } = (await req.json()) as {
      hook: string;
      body: string;
      cta: string;
    };
    if (!hook || !body || !cta) {
      return NextResponse.json(
        { error: "Select a hook, a body and a cta." },
        { status: 400 }
      );
    }
    const cfg = loadConfig();
    const rows = await scanComponents(cfg);
    const { jobId } = startPreviewJob(cfg, rows, { hook, body, cta });
    return NextResponse.json({ jobId });
  } catch (e: any) {
    const raw = e?.message || String(e);
    return NextResponse.json({ error: humanize(raw), detalhe: raw }, { status: 500 });
  }
}
