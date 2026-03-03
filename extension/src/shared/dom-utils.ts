/** Safely extract text content, stripping excess whitespace */
export function getCleanText(el: HTMLElement | null): string {
  if (!el) return "";
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

/** Parse engagement count from text like "1.2K", "5", "432" */
export function parseEngagement(text: string): number {
  const clean = text.trim().toLowerCase();
  if (clean.includes("k")) return Math.round(parseFloat(clean) * 1000);
  if (clean.includes("m")) return Math.round(parseFloat(clean) * 1_000_000);
  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : num;
}
