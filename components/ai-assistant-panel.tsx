"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Bot, User, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AiAssistantPanelProps {
  open: boolean;
  onClose: () => void;
  onWidthChange?: (width: number) => void;
}

// Simple markdown-to-JSX renderer for links and formatting
function renderMarkdown(text: string) {
  const parts: React.ReactNode[] = [];
  const lines = text.split("\n");

  lines.forEach((line, lineIdx) => {
    if (line.startsWith("### ")) {
      parts.push(
        <h4 key={lineIdx} className="font-semibold text-sm mt-3 mb-1 text-foreground">
          {line.slice(4)}
        </h4>
      );
      return;
    }
    if (line.startsWith("## ")) {
      parts.push(
        <h3 key={lineIdx} className="font-semibold text-sm mt-3 mb-1 text-foreground">
          {line.slice(3)}
        </h3>
      );
      return;
    }
    if (line.startsWith("# ")) {
      parts.push(
        <h3 key={lineIdx} className="font-bold text-sm mt-3 mb-1 text-foreground">
          {line.slice(2)}
        </h3>
      );
      return;
    }

    if (line.match(/^[\s]*[-*]\s/)) {
      const content = line.replace(/^[\s]*[-*]\s/, "");
      parts.push(
        <div key={lineIdx} className="flex gap-1.5 ml-2 my-0.5">
          <span className="text-primary mt-0.5 shrink-0">•</span>
          <span>{renderInline(content)}</span>
        </div>
      );
      return;
    }

    if (line.trim() === "") {
      parts.push(<div key={lineIdx} className="h-1.5" />);
      return;
    }

    if (line.match(/^---+$/)) {
      parts.push(<hr key={lineIdx} className="border-border/50 my-2" />);
      return;
    }

    parts.push(
      <p key={lineIdx} className="my-0.5">
        {renderInline(line)}
      </p>
    );
  });

  return parts;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s)]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      parts.push(
        <a
          key={match.index}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-0.5"
        >
          {match[1]}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      );
    } else if (match[3]) {
      parts.push(
        <strong key={match.index} className="font-semibold text-foreground">
          {match[3]}
        </strong>
      );
    } else if (match[4]) {
      parts.push(
        <a
          key={match.index}
          href={match[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-0.5 break-all"
        >
          {match[4]}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

const SUGGESTIONS = [
  "Best Facebook groups for hiring Virtual Assistants",
  "Top VA communities with 10k+ members",
  "Where to find Filipino Virtual Assistants",
  "LinkedIn groups for VA recruitment",
  "Reddit communities for hiring remote assistants",
];

const MIN_WIDTH = 320;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 420;

export function AiAssistantPanel({ open, onClose, onWidthChange }: AiAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const [windowWidth, setWindowWidth] = useState(1024);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Track window width
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Drag-to-resize logic (drag left edge to widen/shrink)
  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      setPanelWidth(newWidth);
      onWidthChange?.(newWidth);
    };

    const onMouseUp = () => setIsDragging(false);

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  // Touch drag-to-resize
  useEffect(() => {
    if (!isDragging) return;

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - touch.clientX));
      setPanelWidth(newWidth);
      onWidthChange?.(newWidth);
    };

    const onTouchEnd = () => setIsDragging(false);

    document.addEventListener("touchmove", onTouchMove);
    document.addEventListener("touchend", onTouchEnd);

    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim() }),
        });

        const data = await res.json();

        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.ok
            ? data.response
            : data.error || "Sorry, something went wrong. Please try again.",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Network error. Please check your connection and try again.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
    {/* Drag handle — rendered outside panel so backdrop doesn't block it */}
    {open && windowWidth >= 768 && (
      <div
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
        onTouchStart={(e) => { e.stopPropagation(); setIsDragging(true); }}
        onDoubleClick={() => { setPanelWidth(DEFAULT_WIDTH); onWidthChange?.(DEFAULT_WIDTH); }}
        className={cn(
          "fixed top-0 z-[70] flex h-screen w-6 cursor-col-resize items-center justify-center transition-colors group",
          isDragging && "bg-primary/10"
        )}
        style={{ right: `${panelWidth - 6}px` }}
      >
        <div className={cn(
          "h-20 w-1.5 rounded-full transition-all",
          isDragging ? "bg-primary scale-y-110" : "bg-border/60 group-hover:bg-primary/70 group-hover:h-24"
        )} />
      </div>
    )}

    <div
      className={cn(
        "fixed top-0 right-0 z-50 flex h-screen flex-col border-l border-sidebar-border bg-sidebar shadow-xl",
        "w-full md:w-auto",
        isDragging ? "" : "transition-all duration-300",
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      style={{
        width: windowWidth >= 768 ? `${panelWidth}px` : undefined,
        right: 0,
        transform: open ? "translateX(0)" : "translateX(20px)",
      }}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-sidebar-foreground">Ask AI</h2>
            <p className="text-[10px] text-muted-foreground">VA Group Finder</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-sidebar-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center pt-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 mb-4">
              <Bot className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-sidebar-foreground mb-1">
              VA Group Finder
            </h3>
            <p className="text-xs text-muted-foreground text-center mb-6 max-w-[280px]">
              Ask me to find the best Virtual Assistant groups and communities across Facebook, LinkedIn, Reddit, and more.
            </p>

            {/* Quick suggestions */}
            <div className="w-full space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Try asking
              </p>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-3 py-2.5 text-left text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2.5",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-sidebar-accent/50 text-sidebar-foreground rounded-bl-sm"
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="space-y-0">{renderMarkdown(msg.content)}</div>
                ) : (
                  msg.content
                )}
              </div>
              {msg.role === "user" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted mt-0.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="rounded-xl rounded-bl-sm bg-sidebar-accent/50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Searching for VA groups...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-sidebar-border p-3">
        <div className="relative flex items-end gap-2 rounded-xl border border-sidebar-border bg-background/50 px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about VA groups..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-xs text-sidebar-foreground placeholder:text-muted-foreground outline-none max-h-[80px]"
            style={{ minHeight: "24px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "24px";
              target.style.height = Math.min(target.scrollHeight, 80) + "px";
            }}
          />
          <Button
            size="sm"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="h-7 w-7 shrink-0 rounded-lg p-0"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          Powered by Google Gemini AI
        </p>
      </div>

    </div>
    </>
  );
}
