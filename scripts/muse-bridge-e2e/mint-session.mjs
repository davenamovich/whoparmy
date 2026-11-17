// Mint a pr_session cookie exactly as lib/whop.ts does (HMAC-SHA256 over
// the b64url payload, secret from SESSION_SECRET).
import { createHmac } from "node:crypto";

const secret = process.env.SESSION_SECRET;
const payload = Buffer.from(JSON.stringify({ uid: "e2e-user", iat: Date.now() })).toString("base64url");
const sig = createHmac("sha256", secret).update(payload).digest("base64url");
console.log(`${payload}.${sig}`);
