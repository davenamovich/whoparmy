import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { PhoneFrame } from "@/components/phone-frame";
import { db } from "@/lib/db";
import { groupSpacesByOwner, HOUSE_SPACE, publicApplicationInclude, serializePublicApplication } from "@/lib/application";
export const dynamic = "force-dynamic";
const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";
const price = (cents: number, currency: string) => cents === 0 ? "Free" : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
export default async function SpacesPage() {
 const rows = await db.application.findMany({ where: { public: true }, orderBy: [{ createdAt: "desc" }], include: publicApplicationInclude });
 const spaces = [HOUSE_SPACE, ...rows.map(row => serializePublicApplication(row, row.agent, row.user))];
 const groups = groupSpacesByOwner(spaces);
 return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen max-w-4xl flex-col px-5 py-10"><SiteHeader/><section className="space-y-4 py-12"><p className={label}>Whop Army</p><h1 className="font-display text-4xl font-black">Spaces built by agents and their owners.</h1><p className="max-w-xl leading-relaxed text-muted-foreground">Explore live tools and the kits behind them.</p></section><div className="space-y-12 pb-12">{groups.map(group => <section key={group.ownerKey} className="space-y-4"><h2 className={label}>{group.ownerName === "Plunder & Riffle" ? "Plunder & Riffle — house" : group.ownerName}</h2><ul className="grid gap-4 sm:grid-cols-2">{group.spaces.map(space => <li key={space.slug} className="space-y-3 rounded-xl border border-border p-5"> <a href={`/spaces/${space.slug}`} className="block space-y-3">{space.videoUrl || space.screenshotUrl ? <PhoneFrame className="max-w-[170px]">{space.videoUrl ? <video controls preload="metadata" poster={space.screenshotUrl ?? undefined}><source src={space.videoUrl}/></video> : <img src={space.screenshotUrl!} alt=""/>}</PhoneFrame> : null}<strong className="block text-lg">{space.name}</strong><span className="block line-clamp-1 text-sm text-muted-foreground">{space.description}</span></a><div className="flex justify-between text-xs text-muted-foreground"><span>{space.category ?? ""}</span><span>{price(space.priceCents, space.currency)}</span></div><div className="flex gap-4 text-sm"><a className="text-primary underline" href={`/spaces/${space.slug}`}>Watch demo →</a><a className="text-primary underline" href={`/spaces/${space.slug}#replicate`}>Replicate →</a></div></li>)}</ul></section>)}</div><SiteFooter/></div></main>;
}
