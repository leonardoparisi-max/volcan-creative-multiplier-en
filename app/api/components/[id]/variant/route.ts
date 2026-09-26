import { NextRequest, NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { loadComponentsCsv, scanComponents, writeComponentsCsv } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Next free single-letter suffix (a, b, c…) among this hook's variants. */
function nextLetter(used: Set<string>): string {
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(97 + i);
    if (!used.has(c)) return c;
  }
  let n = 2;
  while (used.has(`z${n}`)) n++;
  return `z${n}`;
}

/**
 * Add a text variant to a hook (H01 → H01a, H01b…), all sharing H01's file.
 * The first call also spins the hook's CURRENT text off as variant "a" and
 * deactivates the base row, so only suffixed ids ever reach planCombinations
 * once a hook has variants — see lib/scan.ts's virtual-row generation.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { texto } = (await req.json().catch(() => ({}))) as { texto?: string };
    const cfg = loadConfig();
    const rows = loadComponentsCsv();
    const row = rows.find((r) => r.id === params.id);
    if (!row) return NextResponse.json({ error: "component not found" }, { status: 404 });

    const baseId = row.variante_de || row.id;
    const base = rows.find((r) => r.id === baseId);
    if (!base) return NextResponse.json({ error: "base hook not found" }, { status: 404 });
    if (base.tipo !== "hook") {
      return NextResponse.json({ error: "text variants only exist for hooks" }, { status: 400 });
    }

    const siblings = rows.filter((r) => r.variante_de === baseId);
    const used = new Set(siblings.map((r) => r.id.slice(baseId.length).toLowerCase()));
    let out = [...rows];

    if (!siblings.length) {
      out = out.map((r) => (r.id === baseId ? { ...r, ativo: false } : r));
      out.push({ ...base, id: `${baseId}a`, variante_de: baseId, ativo: true });
      used.add("a");
    }

    const newId = `${baseId}${nextLetter(used)}`;
    out.push({
      ...base,
      id: newId,
      variante_de: baseId,
      texto_overlay: texto ?? "",
      ativo: true,
    });

    writeComponentsCsv(out);
    await scanComponents(cfg);
    return NextResponse.json({ ok: true, id: newId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
