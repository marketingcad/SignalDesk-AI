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
  Pencil,
} from "lucide-react";

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g;
const isUrl = (s: string) => /^https?:\/\/[^\s]+$/.test(s); // stateless — not the global one

/**
 * Render a draft body with its URLs as blue, clickable links. Links go through
 * openUrl() (Tauri shell in desktop, window.open in web) — a raw <a> would not
 * open the system browser in the packaged app. Whitespace/newlines are preserved
 * by the container's `whitespace-pre-wrap`.
 */
function renderDraft(body: string) {
  return body.split(URL_SPLIT_RE).map((part, i) =>
    isUrl(part) ? (
      <button
        key={i}
        type="button"
        onClick={() => openUrl(part)}
        title={part}
        className="inline break-all text-left text-primary underline underline-offset-2 decoration-primary/40 transition-colors hover:decoration-primary"
      >
        {part}
      </button>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

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
 * The textarea grows to fit its content — no max height. A cap would re-create
 * the original bug: the VA pitch and its profile URL land at the very bottom of
 * the draft, so any inner scroll hides exactly the thing the message exists to
 * deliver. Overflow is handled by the dialog (max-h-[85vh] overflow-y-auto), which
 * scrolls visibly rather than silently clipping.
 */
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
  // The field shows a rendered preview (blue clickable links) by default, and
  // swaps to the raw textarea for editing. A textarea can't style or link text.
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea to fit the draft. Without this the VA pitch and profile URL
  // sit below the fold of a fixed 6-row box and read as missing entirely.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const fit = () => {
      el.style.height = "auto"; // reset first, or it can only ever grow
      // scrollHeight excludes borders, but box-sizing:border-box makes `height`
      // include them — without this the content overflows by exactly 2px.
      const borders = el.offsetHeight - el.clientHeight;
      el.style.height = `${Math.max(el.scrollHeight + borders, MIN_TEXTAREA_PX)}px`;
    };
    fit();

    // Refit on any resize: a window resize, or the dialog's own scrollbar appearing
    // and narrowing us (no window listener catches that). fit() converges — once
    // height matches content it writes the same value, so this cannot loop.
    const observer = new ResizeObserver(fit);
    observer.observe(el);

    // The web font swaps in after first paint and re-measures the text, growing it
    // by a line without any resize. Nothing else would catch this.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) fit();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [body, open, loading, editing]);

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
        setEditing(false); // show the rendered, clickable version of the new draft
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
      setEditing(false);
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

  // const handleCopy = async () => {
  //   const ok = await copyToClipboard();
  //   if (ok) {
  //     setCopied(true);
  //     setTimeout(() => setCopied(false), 2000);
  //   }
  // };

  const handleCopyAndOpen = async () => {
    await copyToClipboard();
    await openUrl(outreachLink(lead, channel));
    onEngaged?.(lead.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        scrollbar-gutter:stable is load-bearing. Without it, measuring the textarea
        at height:auto collapses the dialog, hides its scrollbar, and widens the
        textarea — so we measure at a width the textarea never actually has, and
        the fitted height comes up one wrapped line short.
      */}
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto [scrollbar-gutter:stable]">
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
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Message
            </span>
            {!loading && body.trim() && (
              <button
                type="button"
                onClick={() => setEditing((e) => !e)}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {editing ? (
                  <>
                    <Check className="h-3 w-3" />
                    Done
                  </>
                ) : (
                  <>
                    <Pencil className="h-3 w-3" />
                    Edit
                  </>
                )}
              </button>
            )}
          </div>

          <div className="relative">
            {loading ? (
              <div
                className="flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 text-sm text-muted-foreground"
                style={{ minHeight: MIN_TEXTAREA_PX }}
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Drafting…
              </div>
            ) : editing ? (
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={() => setEditing(false)}
                autoFocus
                placeholder="Your message…"
                className="w-full resize-none overflow-hidden rounded-lg border border-border bg-secondary/40 p-3 text-sm text-foreground leading-relaxed outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
                style={{ minHeight: MIN_TEXTAREA_PX }}
              />
            ) : (
              <div
                onDoubleClick={() => setEditing(true)}
                className="w-full whitespace-pre-wrap wrap-break-word rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground"
                style={{ minHeight: MIN_TEXTAREA_PX }}
              >
                {body ? (
                  renderDraft(body)
                ) : (
                  <span className="text-muted-foreground">Your message…</span>
                )}
              </div>
            )}
          </div>
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
