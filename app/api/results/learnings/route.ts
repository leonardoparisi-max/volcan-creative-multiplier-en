import { NextResponse } from "next/server";
import { loadLearnings } from "@/lib/results/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(loadLearnings());
}
