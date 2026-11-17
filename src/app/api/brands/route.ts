import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { serializeBrand } from "@/lib/serialize";
import { getPlan } from "@/lib/plans";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getWhopUser();
    const brands = await db.brandProfile.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ brands: brands.map(serializeBrand) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load brands" }, { status: 500 });
  }
}

interface BrandBody {
  name: string;
  website?: string;
  industry?: string;
  description?: string;
  products?: string;
  audience?: string;
  voice?: string;
  languages?: string[];
  cta?: string;
  links?: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as BrandBody;
    if (!body.name?.trim()) return NextResponse.json({ error: "Brand name is required." }, { status: 400 });

    const plan = getPlan(user.plan);
    const count = await db.brandProfile.count({ where: { userId: user.id } });
    if (count >= plan.maxBrands) {
      return NextResponse.json(
        { error: `Your ${plan.name} plan allows ${plan.maxBrands} brand profile${plan.maxBrands > 1 ? "s" : ""}. Upgrade for more.` },
        { status: 402 },
      );
    }

    const brand = await db.brandProfile.create({
      data: {
        userId: user.id,
        name: body.name.trim(),
        website: body.website?.trim() || null,
        industry: body.industry?.trim() || null,
        description: body.description?.trim() || null,
        products: body.products?.trim() || null,
        audience: body.audience?.trim() || null,
        voice: body.voice?.trim() || null,
        languages: JSON.stringify(body.languages?.length ? body.languages : ["en"]),
        cta: body.cta?.trim() || null,
        links: body.links?.trim() || null,
      },
    });
    return NextResponse.json({ brand: serializeBrand(brand) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create brand" }, { status: 500 });
  }
}
