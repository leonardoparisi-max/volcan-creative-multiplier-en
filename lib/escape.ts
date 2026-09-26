// ---------------------------------------------------------------------------
// FFmpeg filtergraph escaping. This is the #1 source of silent breakage, so
// it lives in one hardened place used by both drawtext and subtitles.
//
// Two layers matter:
//   1. Filter-argument level: inside a filter's option value, the chars
//      : , [ ] ; ' \ are special and must be backslash-escaped.
//   2. drawtext text= level: apostrophes and % have extra meaning.
//
// We also expose a helper to write text to a sidecar file and reference it via
// textfile= — the bullet-proof route for accented / multi-line hook overlays.
// ---------------------------------------------------------------------------

/** Escape a value used as a filter option (e.g. a file path in subtitles=). */
export function escapeFilterPath(p: string): string {
  // Backslash first, then the filtergraph-special chars.
  return p
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Escape literal text for drawtext's text= option.
 * Handles backslash, colon, percent, apostrophe, and newlines (| → \n handled
 * by caller before this). Accented UTF-8 passes through untouched.
 */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%") // drawtext expands %{...}; a literal percent is %%
    .replace(/'/g, "’") // curly apostrophe dodges quoting hell entirely
    .replace(/,/g, "\\,");
}

/** Convert #RRGGBB or #RRGGBBAA into ffmpeg's 0xRRGGBB@alpha form. */
export function cssColorToFf(hex: string): { color: string; alpha: number } {
  let h = hex.replace("#", "").trim();
  let alpha = 1;
  if (h.length === 8) {
    alpha = parseInt(h.slice(6, 8), 16) / 255;
    h = h.slice(0, 6);
  }
  return { color: `0x${h.toUpperCase()}`, alpha };
}

/** ASS uses &HAABBGGRR& (alpha inverted: 00 = opaque). */
export function cssColorToAss(hex: string): string {
  let h = hex.replace("#", "").trim();
  let a = "00";
  if (h.length === 8) {
    const alpha = parseInt(h.slice(6, 8), 16);
    a = (255 - alpha).toString(16).padStart(2, "0").toUpperCase();
    h = h.slice(0, 6);
  }
  const rr = h.slice(0, 2);
  const gg = h.slice(2, 4);
  const bb = h.slice(4, 6);
  return `&H${a}${bb}${gg}${rr}`.toUpperCase();
}
