import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function timeAgo(date: Date | string): string {
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function getIntentColor(score: number) {
  if (score >= 80) return { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", label: "High" };
  if (score >= 50) return { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", label: "Medium" };
  return { bg: "bg-zinc-500/10", text: "text-zinc-400", border: "border-zinc-500/20", label: "Low" };
}

export function getPlatformColor(platform: string) {
  switch (platform) {
    case "Facebook": return "#1877F2";
    case "LinkedIn": return "#0A66C2";
    case "Reddit": return "#FF4500";
    case "X": return "#a1a1aa";
    default: return "#71717a";
  }
}
