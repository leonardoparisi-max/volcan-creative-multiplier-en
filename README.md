# Creative Multiplier

Local tool that combines **hooks × bodies × ctas** and spits out final videos
**ready to upload** to Meta / TikTok / YouTube — no manual editing afterwards.
All processing (silence trim, denoise, loudness, karaoke captions, text
overlay, transitions, opener/closer) is automatic and defined in
`config.json`.

> **Video editor, no terminal?** Use
> [README-EDITOR.md](README-EDITOR.md) and double-click
> `Open Creative Multiplier.command`. This README is the technical reference.

## Run

```bash
npm install
npm run dev
```

Opens at <http://localhost:4311>.

> Runs **locally**. Not meant for deployment.

## Dependencies (macOS Apple Silicon)

The app checks everything on startup (the "Dependencies" banner). To install:

```bash
# IMPORTANT: homebrew-core's ffmpeg ships WITHOUT libass/libfreetype, so
# drawtext (overlay) and subtitles (caption) don't exist in it. Use the tap:
brew tap homebrew-ffmpeg/ffmpeg
brew install homebrew-ffmpeg/ffmpeg/ffmpeg   # includes libass + freetype + videotoolbox
brew install whisper-cpp

# transcription model (~1.5GB) in ./models
curl -L -o models/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

The dependencies banner explicitly validates the `drawtext` and `subtitles`
filters — if you have the wrong ffmpeg installed, it warns before any render.

The **Montserrat** (ExtraBold) font needs to be in `~/Library/Fonts`.

## Folders

```
input/
  hooks/     H01_description.mp4, H02_...
  bodies/    B01_...
  ctas/      C01_...
output/<batch_id>/   combinations + manifest.csv
.cache/              normalized masters (by hash), captions, thumbs
models/              whisper model
config.json          global configuration
components.csv       per-component metadata (generated on scan)
```

`input_dir` and `output_dir` can point to any path in `config.json` —
including a synced Google Drive Desktop folder.

## Flow

1. **Components** — drop clips into the folders, click *Rescan*. Toggle
   caption, write an overlay, mark incompatibilities, and activate/deactivate
   components. Caption and overlay are **mutually exclusive** on the same
   component (if there's an overlay, the caption is ignored — the UI warns).
2. **Settings** — every field in `config.json`, including the transition
   dropdown.
3. **Preview** — renders **one** hand-picked combination to validate the
   style before firing off the whole batch.
4. **Render** — shows the combination count + time/disk estimate, fires the
   batch with configurable concurrency, a real progress bar, an error log,
   and a button to open the folder in Finder.

## How it works (pipeline)

- **Stage 1 — Ingestion** (cached by file hash + style): each component
  becomes a *normalized master* in `.cache/normalized/`. Order: trim silence
  at the edges → denoise (`afftdn`) → **two-pass** loudness (`loudnorm`) →
  scale/crop to 1080×1920 30fps → **burn caption OR overlay into the
  component** (never into the final combination).
- **Stage 2 — Combinations**: cartesian product, filtering inactive
  components and incompatible pairs (bidirectional).
- **Stage 3 — Render**: concatenates the 3 masters with `xfade` (audio via
  `acrossfade`), applies opener/closer, encodes with the config's
  encoder/bitrate. A failed render doesn't take down the batch.
- **Stage 4 — Manifest**: `manifest.csv` links each file to its combination
  and to the hook's text (overlay or the transcript's first 12 words).

### Details that avoid rework

- Cached by **file hash + style config**: swap the file (same name) or
  change the caption style and only the affected piece reprocesses.
- `xfade` only handles video — audio gets `acrossfade` at the same duration.
- Final duration = Σdurations − (n transitions × duration), reflected in the
  manifest.
- Fonts resolved to the `.ttf`'s absolute path (drawtext requires a path).
- If `sobrescrever_existentes=false`, already-rendered combinations are
  skipped — an interrupted batch can be resumed.
