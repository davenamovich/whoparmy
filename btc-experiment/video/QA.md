# QA — BTC Experiment Offer Video ("The Offer, Explained")
**File:** `btc-offer-video-9x16.mp4` · Produced 2026-11-19 · NOT posted/published anywhere.

## ffprobe facts (final delivered file)
- Dimensions: **1080×1920** (9:16), H.264, 30 fps
- Duration: **95.95s** total (89.0s narration + ~0.3s/scene pads + 5s end card). The script's ~75s was a guide; the verbatim script at Joe's natural Fish announcer pace runs 89s — no lines were cut or sped up.
- Audio: AAC stereo present; video stream 95.93s / audio stream 95.95s (in sync)
- Volume: mean **−15.7 dB**, max **−0.7 dB** (passes the house audio gate)
- Size: 65.0 MB

## Voice
- Fish Audio TTS, model s2.1-pro, **reference_id 35811cf8e3b641caad9ee5dcfa0d7c73** (Joe's locked voice) for all 6 narration segments. No default voice, no fallback.
- The clips' own model-generated audio was discarded; only Fish narration is in the mix.

## Listen check (Fish ASR readback of the finished file)
Full transcript recovered and matches the approved script end to end, including the closing "Save your link, get your agent. Let's see what it can do." ASR artifacts only: it renders "Twenty-six" as "26" and hears "Whop Army" as "WAP Army" — the TTS input text was verbatim, so these are transcription quirks, not narration errors. Transcript: `work/transcript.json`.
- Flagged for Dave's final ear-check (per engine rules, lip-sync/motion smoothness can't be fully self-verified): narration is muxed over Joe's moving performance; his mouth moves throughout but this is not frame-exact lip-sync.

## Frame check (12 source frames + 3 final frames inspected)
- **Character: PASS, no drift.** Same Joe in all 6 clips — early-30s, clean-shaven, slicked side-part, charcoal suit, patterned tie, folded pocket square, warm B&W + grain — matching `~/workspace/spokesman/retro-pitchman-reference.webp`.
- **Motion: PASS.** Every clip has real motion (pose/framing differs between t=2s and t=7.5s frames in all six); scenes are extended by ping-pong looping to match narration length, never a frozen portrait.
  - S1: Joe presenting a wall of silver briefcases → steps in, points at camera
  - S2: Joe tapping a large phone prop → turns to camera, open-palm present (screen shows color-bar/abstract graphics rather than literal memes — acceptable cutaway, noted)
  - S3: Joe at a desk working an open toolbox + model storefront, arms-wide present
  - S4: Joe laughing/looking down → holding a small coin to camera (blank-tag beat reads as the coin beat; no readable text)
  - S5: counting on fingers → leaning in with thumbs-up
  - S6: grin + orange coin prop visible on desk (the one color accent) → sign-off framing
- Minor: a background model-storefront prop in S3 carries small garbled lettering ("PRODONSTRATION"); a recurring studio set sign reads "NOW LIVE / PRODUCT DEMONSTRATION" (legible, plausible set dressing). Neither is foreground content.
- **End card: PASS** (frame at 93s inspected): orange ₿ coin, "SAVE YOUR LINK → GET YOUR AGENT", `whop.plunderandriffle.com/bridge`, small print verbatim: "An experiment, not a promise. No earnings guaranteed. DH Media is a third-party program; its terms at dh.media apply."

## Fixes applied during production
1. First end card rendered ₿ as an empty box (DejaVu lacks U+20BF) → replaced with a drawn orange ₿ coin (PIL), re-inspected.
2. First join (stream-copy concat) produced a 104.4s audio stream vs 95.9s video → rejoined with the concat filter; streams now match (95.93/95.95s).

## Not included
- **16:9 cut: not made.** The six clips were generated vertical-only (per-request generation cap), and a center-crop of the 9:16 masters would cut Joe out of frame. A 16:9 version needs its own landscape generations — flagged as a follow-up, not faked.
- Segments, scene files and build script kept in `src/`, `audio/`, `work/`, `build.sh` for re-edits.
