# QA — BTC Experiment Offer Video v2 ("More Humor" cut, RESTART with fixes)
**File:** `btc-offer-video-v2-9x16.mp4` · Produced 2026-11-19 · NOT posted/published anywhere.
**Script:** `~/workspace/btc-experiment/VIDEO-SCRIPT-V2.md` (corrected master). Restart fixes applied per Dave 2026-11-19 17:41 ET: S4 "works his daily traffic pool", S5 "DH Media's own Launch pack". All other lines verbatim as approved.

## Reused vs regenerated (from the cancelled first v2 run)
- **REUSED — Fish segments S1, S2, S3, S6** (`audio/s1,s2,s3,s6.mp3`): ASR-verified against the corrected script before reuse; those scenes' lines never changed, readbacks matched verbatim.
- **REUSED — Joe clips S1, S2, S3, S6** (`src/media-generation-joe-v2-s1/s2/s3/s6…`): frame-checked (see below), no drift, real motion.
- **REGENERATED — S4 and S5, audio + video** (mandatory; their lines changed):
  - Audio: fresh Fish TTS s2.1-pro, locked voice `35811cf8e3b641caad9ee5dcfa0d7c73` — S4 17.95s, S5 23.01s. Old segments preserved at `work/old-run/s4-old.mp3`, `s5-old.mp3`.
  - Video: `src/media-generation-joe-v2-s4-barry2-0-1e7f7f49….mp4`, `src/media-generation-joe-v2-s5-fingers2-0-c92dfbe4….mp4` — generated from Joe's locked reference still with the verbatim character block.
- **REBUILT — the full join**: all six scene files re-rendered by `build.sh` (the cancelled run's `work/scene3.mp4` was corrupt — moov atom missing — and is replaced), end card rebuilt, joined with the concat FILTER (v1's desync fix), not stream-copy.

## ffprobe facts (final delivered file)
- Dimensions: **1080×1920** (9:16), H.264, **30 fps**
- Duration: **111.28s** total (105.1s narration + 0.3s/scene pads + 5s end card). ~262 spoken words at Joe's natural pace — nothing cut or sped up.
- Streams in sync: video 111.267s / audio 111.281s (Δ 0.014s)
- Volume: mean **−15.9 dB**, max **−0.5 dB** (passes the house audio gate)
- Size: 81.1 MB

## Voice
- Fish Audio TTS, model s2.1-pro, **reference_id 35811cf8e3b641caad9ee5dcfa0d7c73** (Joe's locked voice) for all 6 narration segments. The clips' own model-generated audio was discarded; only Fish narration is in the mix.

## Listen check (Fish ASR readback of the FINISHED file)
Full transcript recovered and matches the corrected script end to end, including both restart fixes:
- S4: "…works his **daily traffic pool**, and files the report." ✓
- S5: "DH Media's own **launch pack** is $10, their price, paid to them, optional." ✓
- Closing: "Save your link, get your agent." ✓
ASR artifacts only: "Whop Army" heard as "WOP Army" (same quirk class as v1's "WAP Army"), "ten dollars" normalized to "$10", "Twenty-six" as "26" — TTS input text was verbatim in every case, so these are transcription quirks, not narration errors. Transcript: `work/transcript.json`.
- Flagged for Dave's final ear-check (per engine rules): narration is muxed over Joe's moving performance; his mouth moves throughout but this is not frame-exact lip-sync.

## Frame check (12 source frames + 3 final-film frames inspected)
- **Character: PASS, no drift.** Same Joe in all 6 scenes — early-30s, clean-shaven, slicked side-part, charcoal suit, patterned tie, folded pocket square, warm B&W + grain — matching `~/workspace/spokesman/retro-pitchman-reference.webp`.
- **Motion: PASS.** Pose/framing differs between t=2s and t=7.5s frames in every scene; scenes extended by ping-pong looping, never a frozen portrait.
  - S1 (reused): Joe presenting the wall of silver briefcases → steps in, points at camera
  - S2 (reused): Joe holding the phone up, amazed → presents it on his open palm to camera
  - S3 (reused): Joe leaning into the open toolbox → at the desk with tools, rotary phones, model shop (background prop lettering is small set dressing, as in v1)
  - S4 (NEW): Joe in profile, open-palm presenting the **empty chair with a briefcase on it** → turns back to camera grinning. Barry is presented, never shown — no invented body or voice. Note: the briefcase reads dark in B&W rather than visibly orange-glowing; the beat still lands.
  - S5 (NEW): Joe counting — one finger raised to camera → lean-in with hand reaching toward camera; final-film frame at 90s catches him mid-count on two fingers
  - S6 (reused): grinning, hand raised → holding the orange coin prop to camera (the one color accent)
- **End card: PASS** (final-film frame at 109s inspected): drawn orange ₿ coin (PIL — DejaVu lacks U+20BF, v1 fix), "SAVE YOUR LINK → GET YOUR AGENT", `whop.plunderandriffle.com/bridge`, small print verbatim: "An experiment, not a promise. No earnings guaranteed. DH Media is a third-party program; its terms at dh.media apply."

## Not included
- **16:9 cut: not made** (same as v1 — clips are vertical-only masters; a landscape version needs its own generations).
- Segments, clips, scene files and build script kept in `src/`, `audio/`, `work/`, `build.sh` for re-edits.
