import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { outputDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?batch= → the batch's manifest.json (the "Output" grid reads `arquivos` from it).
export async function GET(req: NextRequest) {
  const batch = req.nextUrl.searchParams.get("batch") || "";
  if (!/^[\w.\-]+$/.test(batch)) {
    return NextResponse.json({ error: "invalid batch" }, { status: 400 });
  }
  const cfg = loadConfig();
  const file = path.join(outputDir(cfg), batch, "manifest.json");
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ arquivos: [] });
  }
}
