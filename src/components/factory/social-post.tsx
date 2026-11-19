"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AssetDTO } from "@/lib/types";

/**
 * The post composer (Dave, 2026-11-18): on any Library piece, Post
 * opens this — pick the Upload-Post profile, the accounts, the
 * caption, and the first comment (Facebook & YouTube especially —
 * that's where the link goes). The Post button IS the approve tap:
 * nothing leaves the app until it's pressed, and it posts through
 * the member's own Upload-Post key to their own accounts.
 */

const FIRST_COMMENT_PLATFORMS = ["facebook", "youtube", "instagram", "threads", "bluesky", "x", "linkedin", "tiktok"];

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
  profiles?: Profile[];
  profilesError?: string;
}

export function SocialPostButton({ asset }: { asset: AssetDTO }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [profile, setProfile] = useState<string>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [schedule, setSchedule] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "posted" | "scheduled">(null);

  const kind = asset.imageUrl ? "photo" : "text";
  const activeProfile = useMemo(
    () => state?.profiles?.find((p) => p.username === profile) ?? state?.profiles?.[0],
    [state, profile],
  );
  const showFirstComment = [...picked].some((p) => FIRST_COMMENT_PLATFORMS.includes(p));

  useEffect(() => {
    if (!open) return;
    setDone(null);
    setCaption(asset.type === "MEMES" ? asset.title ?? "" : [asset.title, asset.body].filter(Boolean).join("\n\n"));
    setFirstComment(asset.pageUrl ?? "");
    setSchedule("");
    setState(null);
    void fetch("/api/upload-post")
      .then((r) => r.json())
      .then((json: State) => {
        setState(json);
        const first = json.profiles?.[0];
        if (first) {
          setProfile(first.username);
          setPicked(new Set(first.accounts.filter((a) => !a.reauthRequired).map((a) => a.platform)));
        }
      })
      .catch(() => setState({ connected: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  function chooseProfile(username: string) {
    setProfile(username);
    const p = state?.profiles?.find((x) => x.username === username);
    setPicked(new Set((p?.accounts ?? []).filter((a) => !a.reauthRequired).map((a) => a.platform)));
  }

  function togglePlatform(platform: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  async function post() {
    if (!activeProfile || picked.size === 0 || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/upload-post/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: activeProfile.username,
          platforms: [...picked],
          kind,
          mediaUrl: asset.imageUrl ?? undefined,
          text: caption,
          firstComment: showFirstComment && firstComment.trim() ? firstComment.trim() : undefined,
          scheduledDate: schedule ? new Date(schedule).toISOString() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Posting failed");
      setDone(schedule ? "scheduled" : "posted");
    } catch (err) {
      toast({ title: "Post failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Send className="h-4 w-4" /> <span>Post</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Post to your socials</DialogTitle>
        </DialogHeader>

        {state === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your accounts…
          </p>
        ) : !state.connected ? (
          <div className="space-y-2 py-2">
            <p className="text-sm font-bold">Your Upload-Post account isn&apos;t connected yet.</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connect your key in <b>Account → Your socials — Upload-Post</b> and this composer will list
              your profiles and accounts. Your socials stay linked inside Upload-Post — we never see a login.
            </p>
          </div>
        ) : done ? (
          <div className="space-y-3 py-2">
            <p className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              {done === "scheduled" ? "Scheduled" : "Posted"} — {activeProfile?.username} · {[...picked].join(", ")}
            </p>
            <p className="text-sm text-muted-foreground">
              {done === "scheduled"
                ? "It will go out at the time you picked. You can check or cancel it in Upload-Post."
                : "It's live on the accounts you picked. Links and per-platform results are in your Upload-Post history."}
            </p>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {(state.profiles ?? []).length > 1 ? (
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Profile</span>
                <select
                  value={activeProfile?.username ?? ""}
                  onChange={(e) => chooseProfile(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {(state.profiles ?? []).map((p) => (
                    <option key={p.username} value={p.username}>
                      {p.username}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Accounts — {activeProfile?.username}
              </p>
              {(activeProfile?.accounts ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No socials linked to this profile yet — link them from Account → Your socials.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(activeProfile?.accounts ?? []).map((a) => {
                    const on = picked.has(a.platform);
                    return (
                      <button
                        key={a.platform}
                        onClick={() => togglePlatform(a.platform)}
                        disabled={a.reauthRequired}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition-colors ${
                          on ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground"
                        } ${a.reauthRequired ? "opacity-50" : ""}`}
                      >
                        {a.image ? <img src={a.image} alt="" className="h-4 w-4 rounded-full" /> : null}
                        <span className="capitalize">{a.platform}</span>
                        <span className="opacity-75">{a.handle ?? ""}</span>
                        {a.reauthRequired ? <span className="text-destructive font-semibold">re-link</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {kind === "text" ? "Post text" : "Caption"}
              </span>
              <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} className="text-sm" />
            </label>

            {showFirstComment ? (
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  First comment — Facebook &amp; YouTube shine here
                </span>
                <Textarea
                  value={firstComment}
                  onChange={(e) => setFirstComment(e.target.value)}
                  rows={2}
                  className="text-sm"
                  placeholder="The link, the offer, the hashtags — posted as the first comment"
                />
              </label>
            ) : null}

            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Schedule (optional — blank posts now)
              </span>
              <Input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
            </label>

            <div className="flex items-center gap-3 pt-1">
              <Button onClick={post} disabled={picked.size === 0 || busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {schedule ? "Schedule it" : "Post now"}
              </Button>
              <p className="text-xs text-muted-foreground">
                This tap is the approval — it goes out on your accounts, through your key.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
