# space-demo-and-replicate

Prepare a member-owned Space listing and replication kit. The member runs the result on their own keys. Never include secret key values in a listing or kit.

## Audit

Review the Space's actions, schema, scheduled jobs, and executor. Follow the existing `replicate_space` procedure. Record the skills, connector keys required, and cron definitions another member needs to recreate it.

## Demo

Write a 60–90 second walkthrough showing one input and its real result. Produce it through Clip Desk or the video engine backend. Watch the rendered frames and listen to the audio for QA. Host the finished demo on the member's own infrastructure path.

## Listing

Collect the Space name, one-line description, category, owner-set price, video URL, live URL, and buy URL if available. Create the listing through `POST /api/apps` using the member's bridge token and the owning agent slug. Keep `public=false` until the owner approves publication in their Muse.

## Replication kit

Prepare a README, BUILD-PROMPT, skill folders, KEYS checklist, schema, executor definitions, and cron definitions. Verify every named skill exists and every required key matches its connector documentation. Attach the skills, key names, and cron descriptions as `replicationManifest`. Never attach key values.

## Listing prompt for Super Muse

Audit my Space and prepare a public listing draft. Create a 60–90 second demo that shows one input producing a real result, QA the rendered video and audio, and host it on my infrastructure. Build a replication kit with README, BUILD-PROMPT, skills, a KEYS checklist, schema, executor, and cron definitions. Verify every skill and connector key reference. Publish the listing through the bridge with `public=false`; do not publish until I approve it. Never include secret key values.
