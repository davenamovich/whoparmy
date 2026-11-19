"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, Reply } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * REPLY GUY (Dave, 2026-11-18): the agent on Trending's X topics.
 * It reads the original post, writes reply options, and generates
 * a meme — the member picks the words and clicks once, and the
 * meme posts as a reply through their own Upload-Post X account.
 * No X account connected → copy + open fallback, still fast.
 */

interface TrendTopicLike {
  title: string;
  headline: string;
  hook: string;
  link: string;
}

interface Prepared {
  post: { author: string; authorName: string | null; text: string; views: number | null; likes: number | null; id: string; url: string };
  options: string[];
  meme: { imageUrl: string; pageUrl: string };
}

interface XProfile {
  username: string;
  handle: string | null;
}

export function ReplyGuyButton({ topic }: { topic: TrendTopicLike }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [text, setText] = useState("");
  const [xProfiles, setXProfiles] = useState<XProfile[] | null>(null);
  const [profile, setProfile] = useState("");
  const [posting, setPosting] = useState(false);
  const [done, setDone] = useState(false);

  async function prepare() {
    setPreparing(true);
    setPrepError(null);
    try {
      const res = await fetch("/api/reply-guy/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postUrl: topic.link, headline: topic.headline, hook: topic.hook }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Reply Guy couldn't get ready");
      setPrep(json as Prepared);
      setText((json as Prepared).options[0] ?? "");
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : "Reply Guy couldn't get ready");
    } finally {
      setPreparing(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setDone(false);
    setPrep(null);
    void prepare();
    void fetch("/api/upload-post")
      .then((r) => r.json())
      .then((state: { connected: boolean; profiles?: { username: string; accounts: { platform: string; handle: string | null; reauthRequired: boolean }[] }[] }) => {
        const found: XProfile[] = [];
        for (const p of state.profiles ?? []) {
          const x = p.accounts.find((a) => a.platform === "x" && !a.reauthRequired);
          if (x) found.push({ username: p.username, handle: x.handle });
        }
        setXProfiles(found);
        if (found.length > 0) setProfile(found[0].username);
      })
      .catch(() => setXProfiles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  async function postReply() {
    if (!prep || !profile || posting) return;
    setPosting(true);
    try {
      const res = await fetch("/api/reply-guy/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, postId: prep.post.id, text, imageUrl: prep.meme.imageUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The reply didn't post");
      setDone(true);
    } catch (err) {
      toast({ title: "Reply didn't post", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  }

  const overLimit = text.length > 280;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Reply className="h-3.5 w-3.5 mr-1" /> Reply guy — meme reply
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Reply className="h-5 w-5 text-primary" /> Reply Guy
          </DialogTitle>
        </DialogHeader>

        {preparing ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the post, writing replies, making your meme…
          </p>
        ) : prepError ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-destructive">{prepError}</p>
            <Button variant="outline" onClick={() => void prepare()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Try again
            </Button>
          </div>
        ) : prep ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-3 space-y-1">
              <p className="text-xs font-bold">
                @{prep.post.author}
                {prep.post.authorName ? <span className="text-muted-foreground font-medium"> · {prep.post.authorName}</span> : null}
                {prep.post.views ? <span className="text-muted-foreground font-medium"> · {prep.post.views.toLocaleString()} views</span> : null}
              </p>
              <p className="text-sm leading-relaxed">{prep.post.text}</p>
              <a href={prep.post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">
                Open the post <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your meme reply</p>
              <img src={prep.meme.imageUrl} alt="Reply meme" className="w-full rounded-xl border border-border" />
              <Button variant="ghost" size="sm" onClick={() => void prepare()} disabled={preparing}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> New meme (1 credit)
              </Button>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pick your words — or write your own</p>
              <div className="space-y-1.5">
                {prep.options.map((o, i) => (
                  <button
                    key={i}
                    onClick={() => setText(o)}
                    className={`block w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                      text === o ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="text-sm" maxLength={300} />
              <p className={`text-[11px] ${overLimit ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                {text.length}/280 — replies carry no links (X strips them); the meme carries your brand.
              </p>
            </div>

            {done ? (
              <p className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5 text-primary" /> Reply posted — it's live under @{prep.post.author}'s post.
              </p>
            ) : xProfiles === null ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking your X accounts…
              </p>
            ) : xProfiles.length === 0 ? (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-sm font-bold">No X account connected yet</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  One-click posting needs your X linked through Upload-Post (Account → Your socials). Until
                  then: copy the words, open the post, paste and attach the meme — still under a minute.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(text);
                      toast({ title: "Reply text copied" });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy text
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={prep.post.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open post
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {xProfiles.length > 1 ? (
                  <select
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {xProfiles.map((p) => (
                      <option key={p.username} value={p.username}>
                        {p.username} — X {p.handle ?? ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Posting as <b>{xProfiles[0].username}</b> · X {xProfiles[0].handle ?? ""}
                  </p>
                )}
                <Button className="w-full" onClick={postReply} disabled={posting || overLimit || !text.trim()}>
                  {posting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Reply className="h-4 w-4 mr-2" />}
                  Post this reply — one click
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  This tap is the approval. Heads-up from X: a reply can be refused if your account has
                  never engaged with this author before — if that happens, like their post first and retry.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
