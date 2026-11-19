"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw, Send, Unlink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Account card for the member's own Upload-Post connection
 * (lib/upload-post.ts). Their key, their profiles, their socials —
 * looked up live from Upload-Post by key. New accounts start from
 * the house referral link (Dave's saved hub offer).
 */

const SIGNUP_URL = "https://upload-post.com/?ref=VESSEL"; // Dave's hub offer link

interface SocialAccount {
  platform: string;
  handle: string | null;
  displayName: string | null;
  image: string | null;
  reauthRequired: boolean;
}
interface Profile {
  username: string;
  facebookPageName: string | null;
  accounts: SocialAccount[];
}
interface State {
  connected: boolean;
  house?: boolean;
  email?: string | null;
  plan?: string | null;
  keyHint?: string;
  profiles?: Profile[];
  profilesError?: string;
}

export function UploadPostCard() {
  const { toast } = useToast();
  const [state, setState] = useState<State | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "refresh" | "disconnect" | string>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/upload-post");
      setState((await res.json()) as State);
    } catch {
      setState({ connected: false });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    if (!apiKey.trim() || busy) return;
    setBusy("connect");
    try {
      const res = await fetch("/api/upload-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Connection failed");
      setState(json as State);
      setApiKey("");
      toast({ title: "Upload-Post connected", description: "Your profiles and socials are below." });
    } catch (err) {
      toast({ title: "Couldn't connect", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      await fetch("/api/upload-post", { method: "DELETE" });
      setState({ connected: false });
      toast({ title: "Upload-Post disconnected", description: "Your key was removed from this app. Your Upload-Post account itself is untouched." });
    } finally {
      setBusy(null);
    }
  }

  async function connectLink(profile: string) {
    setBusy(`link:${profile}`);
    try {
      const res = await fetch("/api/upload-post/connect-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't generate the link");
      window.open(json.accessUrl as string, "_blank", "noopener");
      toast({ title: "Connect link opened", description: "Link your socials there, then refresh here." });
    } catch (err) {
      toast({ title: "Link failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="py-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-bold">
              <Send className="h-4.5 w-4.5 text-primary" /> Your socials — Upload-Post
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Post to your own accounts from right here. Connect your Upload-Post key and we look up your
              profiles and every social linked to them — multiple profiles, multiple accounts, all yours.
              Your social logins never touch this app; you link them inside Upload-Post.
            </p>
          </div>
          {state?.connected ? (
            <Button variant="ghost" size="sm" onClick={() => { setBusy("refresh"); void load().finally(() => setBusy(null)); }} disabled={busy === "refresh"}>
              <RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} /> Refresh
            </Button>
          ) : null}
        </div>

        {state === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your connection…
          </p>
        ) : !state.connected ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your Upload-Post API key"
                className="flex-1"
                autoComplete="off"
              />
              <Button onClick={connect} disabled={!apiKey.trim() || busy === "connect"}>
                {busy === "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                Connect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Find your key in Upload-Post under API Keys. It stays on our server, is only ever used as
              you, and is never shown back in full. No Upload-Post account yet?{" "}
              <a href={SIGNUP_URL} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                Create one free — our referral link
              </a>{" "}
              (free plan includes API access; we may earn a commission).
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="font-medium">{state.email ?? "Connected"}</span>
              {state.plan ? <span className="text-muted-foreground">· {state.plan} plan</span> : null}
              {state.keyHint ? <span className="text-muted-foreground">· key {state.keyHint}</span> : null}
              <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={disconnect} disabled={busy === "disconnect"}>
                <Unlink className="h-3.5 w-3.5 mr-1" /> Disconnect
              </Button>
            </div>

            {state.house ? (
              <p className="flex items-start gap-2 text-sm rounded-lg border border-border bg-muted/50 px-3 py-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  This key belongs to the <b>house Upload-Post account</b> — the profiles below are the
                  house's (Plunderandriffle, Jobless Joe…), not a member's. That's expected when the
                  operator tests with the house key; a member connecting their own key sees only their
                  own profiles and socials.
                </span>
              </p>
            ) : null}

            {state.profilesError ? (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" /> {state.profilesError}
              </p>
            ) : null}

            {(state.profiles ?? []).length === 0 && !state.profilesError ? (
              <p className="text-sm text-muted-foreground">
                No profiles on that account yet. Create a profile in Upload-Post, then refresh here.
              </p>
            ) : null}

            {(state.profiles ?? []).map((p) => (
              <div key={p.username} className="rounded-xl border border-border p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm">{p.username}</p>
                  {p.facebookPageName ? <span className="text-xs text-muted-foreground">FB page: {p.facebookPageName}</span> : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => connectLink(p.username)}
                    disabled={busy === `link:${p.username}`}
                  >
                    {busy === `link:${p.username}` ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
                    Link / add socials
                  </Button>
                </div>
                {p.accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No socials linked to this profile yet — use the link button to connect them.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {p.accounts.map((a) => (
                      <span key={a.platform} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs">
                        {a.image ? <img src={a.image} alt="" className="h-4 w-4 rounded-full" /> : null}
                        <span className="font-semibold capitalize">{a.platform}</span>
                        <span className="text-muted-foreground">{a.handle ?? a.displayName ?? "connected"}</span>
                        {a.reauthRequired ? (
                          <span className="inline-flex items-center gap-0.5 text-destructive font-semibold">
                            <AlertTriangle className="h-3 w-3" /> re-link
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <p className="text-xs text-muted-foreground">
              Posting lives on your content: open any piece in your Library and hit Post — you pick the
              profile, the accounts, the caption and the first comment, and nothing goes out until you tap.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
