"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCcw,
  Settings2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

export interface WhopCheckoutUrls {
  CREATOR: string | null;
  PRO: string | null;
  AGENCY: string | null;
  ARMY_CUSTOM: string | null;
  ARMY_AGENCY: string | null;
}

export interface WhopSessionData {
  mode: "whop" | "operator";
  admin: boolean;
  connected: boolean;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    whopUsername: string | null;
    whopAvatarUrl: string | null;
    whopId: string | null;
    plan: string;
    planName: string;
    planSource: string;
  };
  whop: {
    oauthConfigured: boolean;
    apiConfigured: boolean;
    webhookConfigured: boolean;
    apiEnv: string;
    checkoutUrls: WhopCheckoutUrls;
  };
}

export function useWhopSession() {
  const [session, setSession] = useState<WhopSessionData | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setSession(json as WhopSessionData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { session, loading, reload };
}

const PLAN_SOURCE_LABELS: Record<string, string> = {
  whop_membership: "Whop subscription",
  whop_access: "Verified via Whop",
  manual: "Preview",
  default: "",
};

/** Header identity chip — signed-in Whop user, login CTA, or honest setup hint. */
export function WhopAccountBadge({
  session,
  loading,
  onSessionChanged,
}: {
  session: WhopSessionData | null;
  loading: boolean;
  onSessionChanged: () => void;
}) {
  const { toast } = useToast();
  const [signingOut, setSigningOut] = useState(false);

  if (loading) {
    return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> session…</span>;
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/whop/logout", { method: "POST" });
      onSessionChanged();
      toast({ title: "Signed out" });
    } finally {
      setSigningOut(false);
    }
  }

  if (session?.mode === "whop") {
    const u = session.user;
    const display = u.whopUsername ?? u.name ?? "Whop User";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 pl-1.5 pr-2.5 py-1 hover:bg-primary/15 transition-colors"
            aria-label="Whop account menu"
          >
            <span className="w-6 h-6 rounded-full bg-primary grid place-items-center text-primary-foreground text-[11px] font-black shrink-0">
              {display.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden sm:block text-xs font-semibold truncate max-w-28">{display}</span>
            <Badge className="bg-primary text-primary-foreground border-0 text-[9px] px-1.5 py-0 font-bold hidden md:inline-flex">
              {u.planName}
            </Badge>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">
            <span className="block truncate">{display}</span>
            {u.whopId ? <span className="block text-[10px] text-muted-foreground font-normal truncate">{u.whopId}</span> : null}
            {PLAN_SOURCE_LABELS[u.planSource] ? (
              <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary font-medium">
                <BadgeCheck className="h-3 w-3" /> {PLAN_SOURCE_LABELS[u.planSource]}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              try {
                const res = await fetch("/api/whop/sync-entitlements", { method: "POST" });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error ?? "Sync failed");
                toast({ title: `Plan synced: ${json.planName}`, description: "Verified against your live Whop access." });
                onSessionChanged();
              } catch (err) {
                toast({ title: "Entitlement sync failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
              }
            }}
          >
            <RefreshCcw className="h-4 w-4 mr-1" /> Sync entitlements
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <LogOut className="h-4 w-4 mr-1" />}
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Operator (sandbox/dev) mode
  if (session?.whop.oauthConfigured) {
    return (
      <Button asChild size="sm" className="h-8 bg-primary hover:bg-primary/90 font-semibold text-xs">
        <a href="/api/auth/whop" aria-label="Log in with Whop">
          <UserRound className="h-3.5 w-3.5 mr-1" /> Log in with Whop
        </a>
      </Button>
    );
  }

  return (
    <a
      href="#account"
      onClick={(e) => {
        e.preventDefault();
        window.location.hash = "account";
        document.getElementById("main-content")?.scrollIntoView({ behavior: "smooth" });
      }}
      className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      title="Set WHOP_APP_ID to enable Log in with Whop"
    >
      <Settings2 className="h-3 w-3" /> Whop login not set up
    </a>
  );
}

/** Subscribe button — live Whop checkout link, or an honest "not configured" state. */
export function WhopCheckoutButton({
  url,
  label,
  size = "default",
}: {
  url: string | null;
  label: string;
  size?: "default" | "sm";
}) {
  if (!url) {
    return (
      <Button variant="outline" size={size} className="w-full font-semibold" disabled>
        Checkout not configured
      </Button>
    );
  }
  return (
    <Button asChild size={size} className="w-full font-semibold bg-primary hover:bg-primary/90">
      <a href={url} target="_blank" rel="noopener noreferrer">
        {label} <ExternalLink className="h-3.5 w-3.5 ml-1" />
      </a>
    </Button>
  );
}
