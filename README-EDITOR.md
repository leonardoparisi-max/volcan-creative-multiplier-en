# Creative Multiplier — quick guide for editors

Tool that stitches your clips (hook + body + CTA) into several finished ads
automatically. You don't need to know anything about programming — double-click
**`Open Creative Multiplier.command`** and it opens itself in the browser.

## Requirements

- **Mac only** (it uses macOS-specific video encoding). There's no Windows
  version yet.
- The **first run** downloads everything it needs on its own (Homebrew,
  ffmpeg, the ~1.5GB transcription model) — this can take a few minutes
  depending on your internet. Every run after that opens instantly.
- Internet is only needed for that first install; after that the tool runs
  100% offline on your machine — none of your videos ever leave it.

## 1. Where to put the clips

Inside the `input/` folder there are three subfolders:

```
input/
  hooks/    → the first seconds of the ad (the hook)
  bodies/   → the middle, explaining the offer/method
  ctas/     → the ending, calling for action
```

Drag your videos into the right folder (or use the **Add** button/drag
straight into the column on the Components screen).

### How to name the files

Every file needs to start with a letter + number + underscore:

- Hooks: `H01_...`, `H02_...`, `H03_...`
- Bodies: `B01_...`, `B02_...`
- CTAs: `C01_...`

Example: `H01_customer_pain.mp4`. If you don't add the prefix, the tool
renames it automatically when you import it through the screen (but files
dropped straight into the folder via Finder, with no prefix, show up with a
red warning asking you to rename them).

Two files with the **same** prefix (two `H01_`, for example) also error out —
each piece needs a unique number within its type.

## 2. The flow, step by step

1. **Components** — check that all your clips are there, turn on the
   automatic caption or write a fixed text for each one, and mark what you
   want active/inactive for the batch.
2. **Connections** — click a hook and toggle which bodies and ctas it can
   form (by default everything is connected — you only cut what you
   **don't** want).
3. **Preview** — pick one combination and render just it, to check that the
   caption, text and transition came out right before generating everything.
4. **Render** — give the "leva" (batch) a name (e.g. `february-launch`) and
   click Render. The tool generates every allowed combination. If you run it
   again on the same leva without changing anything, it skips what's already
   done — it only redoes what you changed.
5. **Output** — each leva shows up in a list, with a thumbnail and duration
   for every video. From there you can open the folder in Finder, open the
   spreadsheet (manifest) with all the data, or delete the whole leva.

## 3. Automatic captions

By default, every clip tries to generate an automatic caption (the karaoke
words that light up one at a time). Sometimes the transcript gets a word
wrong — to fix it, open the clip (click its card), go to the **Caption**
section and edit each word's text right there. Click **save**. Until you
review it, a gray "caption not reviewed" warning shows on the card — it goes
away as soon as you save.

If the transcript came out very wrong, use **re-transcribe** to redo it from
scratch (this discards any saved edit).

## 4. When an error shows up

The tool tries to explain the error in plain English, like:

- **"Font X not installed"** → the Montserrat ExtraBold font needs to be
  installed. Download it at
  <https://fonts.google.com/specimen/Montserrat> (the "Static" tab, ask for
  the "ExtraBold" weight) and copy the `.ttf` to `~/Library/Fonts`. Reload
  the page afterwards.
- **"This video file is corrupted or incomplete"** → the clip probably
  stopped copying halfway through. Copy it again from the phone/camera.
- **"This file isn't a valid video"** → check that it's actually a video
  clip (not, say, a renamed photo).
- **"No free disk space"** → free up space, or go to Settings and clear the
  cache/old outputs.
- **"whisper-cli isn't installed"** or **"ffmpeg isn't installed"** → close
  the tool and double-click `Open Creative Multiplier.command` again — it
  reinstalls on its own.

If the error isn't one of these, it shows up raw (technical text from the
program underneath) — in that case, call whoever set up the tool for you.

There's always a "deps" dot at the top of the screen: green = all good,
orange = something's missing (click "details" to see what).

## 5. Tools on each clip's card

Opening a clip (clicking its card) lets you:

- **Rename** — changes just the descriptive part of the name (the `H01_`
  prefix stays).
- **Duplicate** — creates a copy of the file, so you have two independent
  versions.
- **Delete** — doesn't really delete it: moves it to `input/_lixeira/`, so
  you can recover it manually if needed.

---

Technical question? [README.md](README.md) has the details of how the tool
works under the hood.
