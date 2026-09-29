# Ryu feature video (Remotion)

An ~82 s, 1080p30 feature video cut from **deterministic captures of the app's own demo mode**. Nothing is mocked up: every UI frame is the real app rendering.

## How it's made

1. **Capture** (`capture/capture.mjs`): Playwright opens `http://localhost:8081/?demo` with a *paused* fake clock (`clock.install` + `clock.pauseAt`) and pauses every CSS animation. Each frame advances the clock by exactly 1/30 s, steps the animations by the same amount, and takes a CDP screenshot at 1.5× (2880×1620). Render speed doesn't matter this way: CPU-rendered WebGL at ~3 fps still yields perfectly smooth 30 fps footage. The script also logs click positions and every UI tone the app plays, per frame, to `meta.json`.
2. **Edit** (`src/`): each footage scene is a *time remap* (video frame → captured frame, for speed ramps and slow motion) plus a *virtual camera* (eased zoom/pan keyframes, clamped to the footage). HUD reticles are drawn in footage coordinates and projected through the camera, so they stay locked to panels while the camera moves.
3. **Sound** (`audio/make_audio.py`): synthesized, with no samples. It's a D-minor pad, pulse and riser, with the impact landing on the n+1 reveal. The app's UI chimes are re-synthesized from `apps/app/src/lib/sound.ts` and placed where the capture log says the app played them.

## Reproduce

```bash
# 1. the app in demo mode (repo root)
npm run dev:demo                       # web on :8081

# 2. capture (≈25 min on a 4-core laptop; frames go to public/footage/)
cd video/capture && npm i && npx playwright install chromium
node capture.mjs ../public/footage 1.5 1920 1080 2700
cp ../public/footage/meta.json ../src/capture-main.json   # click + sound log the edit reads

# 3. audio + render
cd .. && npm i
python audio/make_audio.py             # needs numpy + scipy → public/audio/
npx remotion studio                    # preview / tweak
npm run review -- 330 960 1440 1760    # contact-sheet stills (half scale) → out/review/
npx remotion render RyuFeature out/ryu-feature.mp4 --crf=16
ffmpeg -i out/ryu-feature.mp4 -c:v copy -af loudnorm=I=-16:TP=-1.5 -c:a aac -b:a 256k out/ryu-feature-final.mp4
```

If Remotion can't download its Chrome, pass an existing Chromium headless shell with `--browser-executable=<path>` (Playwright's `chromium_headless_shell` works; for `npm run review`, set `RYU_BROWSER=<path>`).

Captured-frame marks the edit depends on (30 fps): enter 85 · voice command 188 · meeting 291 · analysis 1321 · notes 1631 · your note 1871 · close 2084 · Priya 2117 · transcript 2294. Re-capturing with a changed demo script means re-checking the `SC` table.

Fonts in `public/fonts/` are the app's own (Chakra Petch, IBM Plex), SIL Open Font License; see `public/fonts/OFL-*.txt`.

Timing lives in `src/RyuFeature.tsx` (`SC` scene table). The music's section times in `audio/make_audio.py` (`PULSE_IN … OUTRO_AT`) must stay in sync with it.
