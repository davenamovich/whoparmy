import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { buildProfileFromSignals, researchWebsite } from "@/lib/pr-engine";
import { runBrandAnalysis } from "@/lib/brand-research";
import type { AnalyzeResponse } from "@/lib/types";
import { isSupportedLanguage } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 300;

interface AnalyzeBody {
  source: "url" | "description" | "idea" | "brand";
  value: string;
  brandName?: string;
}

export async function POST(req: NextRequest) {
  try {
    await getWhopUser(); // authorization anchor
    const body = (await req.json()) as AnalyzeBody;
    const value = (body.value ?? "").trim();
    if (!value) {
      return NextResponse.json({ error: "Provide a website URL, description or idea." }, { status: 400 });
    }

    if (body.source === "brand") {
      // Deep-research entry (slice 3): brand name + website are BOTH
      // required. The bridge runs from this server on the house key —
      // the member is not logged in to P&R and holds no key yet.
      const brandName = (body.brandName ?? "").trim();
      if (!brandName || !value) {
        return NextResponse.json(
          { error: "Brand name and website are both required for deep research." },
          { status: 400 },
        );
      }
      // Shared with the background research jobs (lib/brand-research).
      return NextResponse.json(await runBrandAnalysis(brandName, value));
    }

    if (body.source === "url") {
      const research = await researchWebsite(value);
      const profile = await buildProfileFromSignals({
        website: value,
        pageText: research.pageText,
        title: research.title,
        metaDescription: research.metaDescription,
      });
      const payload: AnalyzeResponse = research.researched
        ? { profile: sanitize(profile), researched: true }
        : {
            profile: sanitize(profile),
            researched: false,
            note: "We couldn't fully access that website right now, so this profile may be incomplete. Please review and edit before continuing.",
          };
      return NextResponse.json(payload);
    }

    if (body.source === "description" || body.source === "idea") {
      const profile = await buildProfileFromSignals(
        body.source === "description" ? { description: value } : { idea: value },
      );
      const payload: AnalyzeResponse = { profile: sanitize(profile), researched: true };
      return NextResponse.json(payload);
    }

    return NextResponse.json({ error: "Unknown source type." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Business analysis failed: ${err.message}. You can continue with a manual description instead.`
            : "Business analysis failed. You can continue with a manual description instead.",
      },
      { status: 500 },
    );
  }
}

function sanitize<T extends { suggestedLanguages: string[] }>(p: T): T {
  return {
    ...p,
    suggestedLanguages: (p.suggestedLanguages ?? []).filter(isSupportedLanguage),
  };
}
