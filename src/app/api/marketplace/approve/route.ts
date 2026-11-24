import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, isDesignatedOperator } from "@/lib/auth";
import { approveSubmission } from "@/lib/marketplace-server";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    if (!isDesignatedOperator(user)) return NextResponse.json({ error: "Operator access required." }, { status: 403 });
    const body = await req.json();
    if (typeof body.submissionId !== "string") return NextResponse.json({ error: "submissionId is required." }, { status: 400 });
    return NextResponse.json(await approveSubmission(user.id, body.submissionId));
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Could not approve submission." }, { status: 401 }); }
}
