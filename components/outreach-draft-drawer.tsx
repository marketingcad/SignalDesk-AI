"use client";

import { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { openUrl } from "@/lib/open-url";
import { outreachLink } from "@/lib/deep-link";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/types";
import type { OutreachChannel, OutreachTone } from "@/lib/outreach";
import {
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const TONES: { value: OutreachTone; label: string }[] = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "direct", label: "Direct" },
];

const CHANNELS: { value: OutreachChannel; label: string }[] = [
  { value: "comment", label: "Comment" },
  { value: "dm", label: "DM" },
];

/**
 * Cap the auto-grown textarea (px). Drafts run ~400 chars once the VA pitch and
 * profile URL are appended; this fits them without scrolling, and anything
 * longer scrolls inside the box rather than pushing the buttons off-screen.
 */
const MAX_TEXTAREA_PX = 384;
const MIN_TEXTAREA_PX = 132;

interface DraftResponse {
  id: string;
  tone: OutreachTone;
  channel: OutreachChannel;
  body: string;
}

export function OutreachDraftDrawer({
  lead,
  open,
  onOpenChange,
  onEngaged,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEngaged?: (leadId: string) => void;
}) {
  const [tone, setTone] = useState<OutreachTone>("friendly");
  const [channel, setChannel] = useState<OutreachChannel>("comment");
  const [body, setBody] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea to fit the draft. Without this the VA pitch and profile URL
  // sit below the fold of a fixed 6-row box and read as missing entirely.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto"; // reset first, or it can only ever grow
    // scrollHeight excludes borders, but box-sizing:border-box makes `height`
    // include them — without this the content overflows by exactly 2px.
    const borders = el.offsetHeight - el.clientHeight;
    const fitted = el.scrollHeight + borders;
    el.style.height = `${Math.min(Math.max(fitted, MIN_TEXTAREA_PX), MAX_TEXTAREA_PX)}px`;
  }, [body, open, loading]);

  const generate = useCallback(
    async (t: OutreachTone, c: OutreachChannel) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/leads/${lead.id}/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tone: t, channel: c }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to generate draft");
        }
        const { draft } = (await res.json()) as { draft: DraftResponse };
        setBody(draft.body);
        setDraftId(draft.id);
        setTone(draft.tone);
        setChannel(draft.channel);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate draft");
      } finally {
        setLoading(false);
      }
    },
    [lead.id]
  );

  // On open: load the latest saved draft; if none exists yet, auto-generate one.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setCopied(false);
      try {
        const res = await fetch(`/api/leads/${lead.id}/draft`);
        if (!res.ok) throw new Error("Failed to load draft");
        const { draft } = (await res.json()) as { draft: DraftResponse | null };
        if (cancelled) return;
        if (draft) {
          setBody(draft.body);
          setDraftId(draft.id);
          setTone(draft.tone);
          setChannel(draft.channel);
          setLoading(false);
        } else {
          await generate("friendly", "comment");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load draft");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, lead.id, generate]);

  const copyToClipboard = useCallback(async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // Fallback for environments without the async clipboard API
      try {
        const ta = document.createElement("textarea");
        ta.value = body;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        return false;
      }
    }
    // Best-effort: stamp copied_at server-side
    if (draftId) {
      fetch(`/api/leads/${lead.id}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      }).catch(() => {});
    }
    return true;
  }, [body, draftId, lead.id]);

  const handleCopy = async () => {
    const ok = await copyToClipboard();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyAndOpen = async () => {
    await copyToClipboard();
    await openUrl(outreachLink(lead, channel));
    onEngaged?.(lead.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Draft Reply
          </DialogTitle>
          <DialogDescription>
            AI-drafted outreach for{" "}
            <span className="font-medium text-foreground">{lead.username}</span>{" "}
            on {lead.platform}. Review and edit before sending — you always send
            it yourself.
          </DialogDescription>
        </DialogHeader>

        {/* Tone + Channel controls */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <SegmentedControl
            label="Tone"
            value={tone}
            options={TONES}
            disabled={loading}
            onChange={(v) => {
              setTone(v);
              generate(v, channel);
            }}
          />
          <SegmentedControl
            label="Channel"
            value={channel}
            options={CHANNELS}
            disabled={loading}
            onChange={(v) => {
              setChannel(v);
              generate(tone, v);
            }}
          />
        </div>

        {/* Draft body */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={loading}
            placeholder={loading ? "" : "Your message…"}
            className={cn(
              "w-full resize-none overflow-y-auto rounded-lg border border-border bg-secondary/40 p-3 text-sm text-foreground leading-relaxed outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30",
              loading && "opacity-50"
            )}
            style={{ minHeight: MIN_TEXTAREA_PX, maxHeight: MAX_TEXTAREA_PX }}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Drafting…
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => generate(tone, channel)}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Regenerate
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loading || !body.trim()}
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 shadow-sm shadow-primary/25"
              disabled={loading || !body.trim()}
              onClick={handleCopyAndOpen}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Copy &amp; Open
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center rounded-md border border-border bg-secondary/50 p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-50",
              value === opt.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
