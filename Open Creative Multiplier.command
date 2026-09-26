#!/bin/zsh
# Double-click this to open Creative Multiplier. No terminal knowledge needed —
# this script checks/installs whatever is missing and starts the tool.
cd "$(dirname "$0")"

say()  { echo ""; echo "▶ $1"; }
ok()   { echo "  ✓ $1"; }
warn() { echo "  ⚠ $1"; }

echo "======================================"
echo "  Creative Multiplier"
echo "======================================"

# 1. Homebrew -----------------------------------------------------------
say "Checking Homebrew..."
if ! command -v brew >/dev/null 2>&1; then
  warn "Homebrew not found — it's the installer the other steps rely on."
  echo "  Open Terminal (Spotlight → \"Terminal\") and paste this to install it:"
  echo ""
  echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  echo ""
  echo "  Then double-click this file again."
  echo ""
  echo "Press Enter to close this window."
  read -r _
  exit 1
fi
ok "Homebrew found."
BREW_PREFIX=$(brew --prefix)

# 2. Node >= 20 -----------------------------------------------------------
say "Checking Node..."
if ! command -v node >/dev/null 2>&1; then
  warn "Node not found. Installing…"
  brew install node
fi
NODE_MAJOR=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  warn "Node $(node -v 2>/dev/null || echo missing) is old (needs 20+). Updating…"
  brew upgrade node 2>/dev/null || brew install node
fi
ok "Node $(node -v) ok."

# 3. ffmpeg with drawtext + subtitles -------------------------------------
say "Checking ffmpeg (with the text and caption filters)..."
FFMPEG_BIN="$BREW_PREFIX/bin/ffmpeg"
NEEDS_FFMPEG=1
if [ -x "$FFMPEG_BIN" ]; then
  FILTERS=$("$FFMPEG_BIN" -hide_banner -filters 2>/dev/null)
  if echo "$FILTERS" | grep -q "drawtext" && echo "$FILTERS" | grep -q "subtitles"; then
    NEEDS_FFMPEG=0
  fi
fi
if [ "$NEEDS_FFMPEG" = "1" ]; then
  warn "ffmpeg with the right filters not found (the default Homebrew one won't work)."
  echo "  Installing the right build — this takes a few minutes the first time…"
  brew tap homebrew-ffmpeg/ffmpeg
  brew install homebrew-ffmpeg/ffmpeg/ffmpeg
fi
ok "ffmpeg ok."

# 4. whisper-cli ----------------------------------------------------------
say "Checking whisper-cli (caption transcription)..."
if ! command -v whisper-cli >/dev/null 2>&1 && [ ! -x "$BREW_PREFIX/bin/whisper-cli" ]; then
  warn "whisper-cli not found. Installing…"
  brew install whisper-cpp
fi
ok "whisper-cli ok."

# 4b. write the real tool paths into config.json ---------------------------
# config.json ships with Apple Silicon paths (/opt/homebrew). On Intel Macs
# Homebrew installs to /usr/local — without this the tool can't find the
# binaries. Rewrite with whatever was actually found on PATH.
say "Fixing the tool paths in config.json..."
REAL_FFMPEG=$(command -v ffmpeg || echo "$BREW_PREFIX/bin/ffmpeg")
REAL_FFPROBE=$(command -v ffprobe || echo "$BREW_PREFIX/bin/ffprobe")
REAL_WHISPER=$(command -v whisper-cli || echo "$BREW_PREFIX/bin/whisper-cli")
node -e '
  const fs = require("fs");
  const cfg = JSON.parse(fs.readFileSync("config.json", "utf8"));
  cfg.bin.ffmpeg = process.argv[1];
  cfg.bin.ffprobe = process.argv[2];
  cfg.bin.whisper = process.argv[3];
  fs.writeFileSync("config.json", JSON.stringify(cfg, null, 2) + "\n");
' "$REAL_FFMPEG" "$REAL_FFPROBE" "$REAL_WHISPER"
ok "config.json ok."

# 5. transcription model (~1.5 GB) ----------------------------------------
say "Checking the transcription model..."
MODEL="models/ggml-large-v3-turbo.bin"
mkdir -p models
if [ ! -f "$MODEL" ]; then
  warn "Model not found (~1.5 GB, only downloads once)."
  curl -L --progress-bar -o "$MODEL" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"
fi
ok "Model ok."

# 6. Montserrat ExtraBold font ---------------------------------------------
say "Checking the Montserrat ExtraBold font..."
FONT_DIR="$HOME/Library/Fonts"
mkdir -p "$FONT_DIR"
if [ ! -f "$FONT_DIR/Montserrat-ExtraBold.ttf" ] && [ ! -f "$FONT_DIR/MontserratExtraBold.ttf" ]; then
  warn "Font not installed. Downloading…"
  curl -fL -o "$FONT_DIR/Montserrat-ExtraBold.ttf" \
    "https://github.com/google/fonts/raw/main/ofl/montserrat/static/Montserrat-ExtraBold.ttf" \
    || warn "Couldn't download the font automatically — install it manually (see README-EDITOR.md)."
fi
ok "Font ok."

# 7. project dependencies (node_modules) -----------------------------------
say "Checking the project's dependencies..."
if [ ! -d node_modules ]; then
  warn "First time using this folder — installing (a few minutes)…"
  npm install
fi
ok "Dependencies ok."

# 8. start the server and open the browser ---------------------------------
say "Starting Creative Multiplier..."
npm run dev > /tmp/creative-multiplier-international-dev.log 2>&1 &
SERVER_PID=$!

for i in $(seq 1 30); do
  if curl -s http://localhost:4311 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

open http://localhost:4311
ok "Opened in the browser."

echo ""
echo "======================================"
echo "If a dependency couldn't be installed automatically, the tool shows a"
echo "\"Dependencies\" warning on screen explaining what's missing."
echo ""
echo "You can close this window when you're done using it."
echo "(closing this window turns off Creative Multiplier)"
echo "======================================"
wait $SERVER_PID
