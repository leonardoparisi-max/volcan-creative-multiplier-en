import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { runDoctor } from "@/lib/doctor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = loadConfig();
  const report = await runDoctor(cfg);
  return NextResponse.json(report);
}
