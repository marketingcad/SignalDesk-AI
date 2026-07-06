import type { Lead } from "./types";
import type { OutreachChannel } from "./outreach";

// ---------------------------------------------------------------------------
// Deep-link resolver for the outreach flow.
//
// - "comment": the post permalink itself (lead.url) — user replies there.
// - "dm":      a per-platform message-compose URL where one exists, else the
//              post (user opens a DM from the profile/post).
// See docs/AI-OUTREACH-DRAFTS.md.
// ---------------------------------------------------------------------------

export function outreachLink(lead: Lead, channel: OutreachChannel): string {
  if (channel === "comment") return lead.url;

  switch (lead.platform) {
    case "Reddit":
      // Reddit supports a fully prefilled compose link.
      return `https://www.reddit.com/message/compose/?to=${encodeURIComponent(
        lead.username
      )}`;
    case "X":
      return "https://x.com/messages/compose";
    case "LinkedIn":
    case "Facebook":
    default:
      // No reliable DM deep-link → open the post; user DMs from there.
      return lead.url;
  }
}
