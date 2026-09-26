import { NextRequest, NextResponse } from "next/server";
import { parseAiResponse, computeDiff } from "@/lib/results/learningsMerge";
import { loadLearnings } from "@/lib/results/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { raw } -> validates the pasted AI response and returns a diff
// preview. Does NOT save anything — see /api/results/learnings/import.
export async function POST(req: NextRequest) {
  try {
    const { raw } = (await req.json()) as { raw: string };
    const result = parseAiResponse(raw || "");
    if (!result.valid || !result.payload) {
      return NextResponse.json({ valid: false, errors: result.errors });
    }
    const diff = computeDiff(loadLearnings(), result.payload);
    return NextResponse.json({ valid: true, errors: [], diff });
  } catch (e: any) {
    return NextResponse.json({ valid: false, errors: [e?.message || String(e)] }, { status: 400 });
  }
}
