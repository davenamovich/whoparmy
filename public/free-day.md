# Free Day — agent contract

## Read and claim

- `get_free_day` takes no arguments. Its result is `{freeDay}`: `null` if no Space is featured, otherwise `{date, name, slug, mode, endsAt, spaceUrl}`. The `date` is in Eastern Time (ET), `mode` is `HOUSE` or `HANDOUT`, and `endsAt` is the next ET midnight as an ISO timestamp.
- `claim_free_day` takes an optional `{date: "YYYY-MM-DD"}` and returns `{claim}`. Claim only when the member asks. Pass the date you read: if the ET day has flipped, the claim is refused (MCP tool error, or HTTP 409 over REST). Read the new offer before retrying. Omitting `date` claims whichever Space is featured at the time of the call.
- Both tools charge zero bridge credits. With a Muse bearer, you can also use `GET /api/bridge/free-day/today` and `POST /api/bridge/free-day/claim` with the same date guard.
- The bridge account's `freeDay` field shows `{date, name, slug, ownerKind, mode, endsAt, claimed, owned, credit}` or `null` if there's no available rotation or the lookup fails. `ownerKind` is `house` or `member`; `owned` refers to house-kit ownership. `credit` is `{id, expiresAt}` when the claim granted a credit, otherwise `null`.

## Claim outcomes

- **KIT:** The member gets the featured house Space's kit free forever. One claim per member per Space; repeating it returns the same grant. Retrieve it with a Muse bearer at `GET /api/bridge/marketplace/kit?slug={slug}`.
- **CREDIT:** If the member already owns the featured house kit, the claim grants a rotator placement credit. Its ID is the claim's `grantId`; it expires at midnight ET seven calendar days after the featured day started.
- **VISIT:** The claim books a Handout visit to a member Space until midnight ET. It never grants the kit or access to the seller's private jobs, credentials, or data. It does not change existing outputs.

## Redeem a placement credit

With the member's signed-in Whoparmy session, use `GET /api/bridge/rotator/paid` to list unspent credits. Send `{creditId, date, partner}` to `POST /api/bridge/rotator/paid` with the desired placement date and a partner for which the member has a saved link. No payment intent is needed.

## Offer or check a Handout

Sellers can set `handoutOptIn` to `true` or `false` on the Marketplace submit or resubmit payload. Omitting it preserves the existing setting. A Handout offers agent visits during the featured ET day, not a kit giveaway.

Use `GET /api/apps/public/{slug}` with a Muse bearer. While the Space is featured for a Handout, `handout.canUse` indicates whether this member booked a currently valid visit, and `handout.endsAt` gives the visit cutoff.
