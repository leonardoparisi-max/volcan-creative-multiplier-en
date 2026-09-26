import fs from "node:fs";
import path from "node:path";
import { run } from "./exec";
import { PROBE_DIR } from "../paths";
import type { Config } from "../types";

export interface ProbeInfo {
  duration: number; // seconds
  width: number;
  height: number;
  hasAudio: boolean;
  fps: number;
  /** Colour metadata (iPhone HDR = bt2020 + arib-std-b67/smpte2084, 10-bit). */
  pixFmt?: string;
  colorPrimaries?: string;
  colorTransfer?: string;
  colorSpace?: string;
  /** True when the clip needs tone-mapping to bt709 before mixing with SDR. */
  isHdr?: boolean;
}

const HDR_TRANSFERS = new Set(["arib-std-b67", "smpte2084", "smpte428", "bt2020-10", "bt2020-12"]);

export function detectHdr(v: any): boolean {
  if (!v) return false;
  const trc = String(v.color_transfer ?? "");
  const prim = String(v.color_primaries ?? "");
  const pix = String(v.pix_fmt ?? "");
  if (HDR_TRANSFERS.has(trc)) return true;
  if (prim === "bt2020") return true;
  // 10-bit with bt2020 matrix but missing transfer tag: treat as HDR too
  if (String(v.color_space ?? "").startsWith("bt2020") && /10|12/.test(pix)) return true;
  return false;
}

/** ffprobe a file; results cached in .cache/probe keyed by source hash. */
export async function probe(
  cfg: Config,
  file: string,
  hash: string
): Promise<ProbeInfo> {
  const cachePath = path.join(PROBE_DIR, `${hash}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      // older cache entries predate the colour fields → re-probe once
      if ("isHdr" in cached) return cached;
    } catch {
      /* fall through and re-probe */
    }
  }
  const { stdout } = await run(cfg.bin.ffprobe, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const data = JSON.parse(stdout);
  const v = (data.streams || []).find((s: any) => s.codec_type === "video");
  const a = (data.streams || []).find((s: any) => s.codec_type === "audio");
  let fps = 30;
  if (v?.avg_frame_rate && v.avg_frame_rate !== "0/0") {
    const [n, d] = v.avg_frame_rate.split("/").map(Number);
    if (d) fps = n / d;
  }
  const info: ProbeInfo = {
    duration: parseFloat(data.format?.duration ?? v?.duration ?? "0") || 0,
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    hasAudio: !!a,
    fps,
    pixFmt: v?.pix_fmt,
    colorPrimaries: v?.color_primaries,
    colorTransfer: v?.color_transfer,
    colorSpace: v?.color_space,
    isHdr: detectHdr(v),
  };
  fs.writeFileSync(cachePath, JSON.stringify(info));
  return info;
}
