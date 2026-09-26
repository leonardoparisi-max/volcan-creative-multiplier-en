import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { outputDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve a rendered mp4 (preview or a batch file) with HTTP Range support so the
// <video> element can seek. Paths are confined to the output directory.
export async function GET(req: NextRequest) {
  const cfg = loadConfig();
  const out = outputDir(cfg);
  const scope = req.nextUrl.searchParams.get("scope") || "preview";
  const file = req.nextUrl.searchParams.get("file") || "";
  const batch = req.nextUrl.searchParams.get("batch") || "";

  if (!/^[\w.\-]+\.mp4$/i.test(file)) {
    return new NextResponse("bad file", { status: 400 });
  }

  let full: string;
  if (scope === "preview") {
    full = path.join(out, "_preview", file);
  } else if (scope === "batch" && /^[\w.\-:]+$/.test(batch)) {
    full = path.join(out, batch, file);
  } else {
    return new NextResponse("bad scope", { status: 400 });
  }

  // confinement check
  const resolved = path.resolve(full);
  if (!resolved.startsWith(path.resolve(out))) {
    return new NextResponse("forbidden", { status: 403 });
  }
  if (!fs.existsSync(resolved)) return new NextResponse("not found", { status: 404 });

  const stat = fs.statSync(resolved);
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    const chunk = fs.createReadStream(resolved, { start, end });
    return new NextResponse(chunk as any, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": "video/mp4",
      },
    });
  }

  const stream = fs.createReadStream(resolved);
  return new NextResponse(stream as any, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
    },
  });
}
