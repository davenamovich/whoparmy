import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { createPageViewHandler } from "@/lib/page-view-handler";

export const runtime = "nodejs";

export const POST = createPageViewHandler({
  getMemberId: getSessionUserId,
  write: async (data) => { await db.pageView.create({ data }); },
});
