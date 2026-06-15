import { describe, it, expect } from "vitest";
import { fbPostKey, richerFbPost, type GraphQLPost } from "./urlScraper";

const post = (over: Partial<GraphQLPost>): GraphQLPost => ({
  postId: "x",
  author: "unknown",
  text: "",
  timestamp: "",
  permalink: "",
  groupId: "",
  groupName: "",
  ...over,
});

describe("fbPostKey", () => {
  it("extracts the numeric id from a plain permalink", () => {
    expect(fbPostKey(post({ permalink: "https://www.facebook.com/1957852388179775" }))).toBe(
      "1957852388179775"
    );
  });

  it("recovers the same numeric id from a base64 (UzpfST...) permalink", () => {
    // base64 of "S:1775994382:VK:1957852388179775" → embeds the numeric post id
    const encoded =
      "https://www.facebook.com/UzpfSTE3NzU5OTQzODI6Vks6MTk1Nzg1MjM4ODE3OTc3NQ==";
    expect(fbPostKey(post({ permalink: encoded }))).toBe("1957852388179775");
  });

  it("gives the numeric and encoded permalinks of the same post the SAME key", () => {
    const numeric = post({ permalink: "https://www.facebook.com/1957852388179775", author: "An Gie" });
    const encoded = post({
      permalink: "https://www.facebook.com/UzpfSTE3NzU5OTQzODI6Vks6MTk1Nzg1MjM4ODE3OTc3NQ==",
    });
    expect(fbPostKey(numeric)).toBe(fbPostKey(encoded));
  });

  it("falls back to normalized text when no id is present", () => {
    const a = post({ permalink: "https://www.facebook.com/groups/x", text: "Hiring a VA now" });
    const b = post({ permalink: "https://www.facebook.com/share/abc", text: "Hiring a VA now" });
    expect(fbPostKey(a)).toBe(fbPostKey(b));
  });
});

describe("richerFbPost", () => {
  it("prefers the copy with a known author", () => {
    const known = post({ author: "An Gie", permalink: "https://www.facebook.com/UzpfX==" });
    const unknown = post({ author: "unknown", permalink: "https://www.facebook.com/1957852388179775" });
    expect(richerFbPost(known, unknown)).toBe(known);
    expect(richerFbPost(unknown, known)).toBe(known);
  });

  it("prefers a numeric permalink when authorship is equal", () => {
    const numeric = post({ author: "unknown", permalink: "https://www.facebook.com/1957852388179775" });
    const encoded = post({ author: "unknown", permalink: "https://www.facebook.com/UzpfX==" });
    expect(richerFbPost(encoded, numeric)).toBe(numeric);
  });
});
