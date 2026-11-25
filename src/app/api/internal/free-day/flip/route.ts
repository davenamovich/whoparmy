import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getFreeDay } from "@/lib/free-day-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = Buffer.from(process.env.FREE_DAY_CRON_SECRET ?? "");
  const supplied = Buffer.from(req.headers.get("x-free-day-cron") ?? "");
  if (!secret.length || supplied.length !== secret.length || !timingSafeEqual(supplied, secret)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  try { return NextResponse.json({ freeDay: await getFreeDay() }); }
  catch (error) {
    console.error("[free-day] Scheduled flip failed:", error);
    return NextResponse.json({ error: "Free-Day flip failed." }, { status: 500 });
  }
}
