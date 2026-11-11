import { NextResponse } from "next/server";
import { renderHookLayer } from "@/lib/ffmpeg/hookStyles";
import { isHookStyle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live preview of a text hook plate (same renderer the burn-in uses). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const estilo = q.get("estilo") ?? "";
  const texto = q.get("texto") ?? "";
  if (!isHookStyle(estilo) || !texto.trim()) {
    return NextResponse.json({ error: "invalid style or text" }, { status: 400 });
  }
  try {
    // half resolution is plenty for the drawer preview and twice as fast
    const buf = await renderHookLayer({
      texto,
      estilo,
      selo: q.get("selo") ?? "",
      posicao: Number(q.get("posicao") ?? 0.5),
      width: 1080,
      height: 1920,
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: { "content-type": "image/png", "cache-control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
