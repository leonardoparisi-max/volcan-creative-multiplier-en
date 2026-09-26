import { NextRequest, NextResponse } from "next/server";
import { parseAiResponse, mergeLearnings } from "@/lib/results/learningsMerge";
import { loadLearnings, saveLearnings, loadResultsConfig } from "@/lib/results/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { raw } -> re-validates (never trust the client to have re-sent an
// unmodified payload) and merges into results/learnings.json.
export async function POST(req: NextRequest) {
  try {
    const { raw } = (await req.json()) as { raw: string };
    const result = parseAiResponse(raw || "");
    if (!result.valid || !result.payload) {
      return NextResponse.json({ error: "invalid response, nothing was imported", errors: result.errors }, { status: 400 });
    }
    const run = loadResultsConfig().run_atual || 1;
    const merged = mergeLearnings(loadLearnings(), result.payload, run);
    saveLearnings(merged);
    return NextResponse.json(merged);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
