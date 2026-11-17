import { NextResponse } from "next/server";
import { getRotatorDestination } from "@/lib/rotator";

/**
 * PUBLIC — today's no-ref destination as JSON, for the surfaces that
 * send unattributed traffic here (the trial console, pack pages).
 * The day record is the attribution: one destination per ET day.
 */
export async function GET() {
  try {
    const destination = await getRotatorDestination();
    return NextResponse.json(
      { destination },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rotator unavailable" },
      { status: 500 },
    );
  }
}
